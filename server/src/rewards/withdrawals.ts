/**
 * Withdrawals (MASTERPLAN §9, §10).
 *
 * Flow:
 *  1. prepare  — server checks pending ≥ $5, creates a request the player signs (EIP-712, no gas).
 *  2. submit   — server verifies the player's signature, deducts pending, signs a voucher
 *                (player, amount, nonce, expiry) and either relays `claim` (gas sponsored)
 *                or hands the voucher to the player to submit.
 *  3. watcher  — confirms on-chain; refunds pending only after the voucher has expired unused.
 */
import { randomBytes } from 'node:crypto';
import { getAddress, type Address, type Hex } from 'viem';
import {
  WITHDRAW_REQUEST_TYPES,
  formatTokenUnits,
  tokenUnitsToUsd,
  type RewardsDTO,
  type WithdrawPrepareDTO,
  type WithdrawSubmitResponse,
  type WithdrawalDTO,
  type WithdrawalStatus,
} from '@rig-valley/shared';
import type { Db, Queryable } from '../db/index.js';
import type { ConfigStore } from '../configStore.js';
import { fail } from '../errors.js';
import type { GameService } from '../game/service.js';
import { loadState } from '../game/state.js';
import type { ChainService, Voucher } from './chain.js';
import type { PriceFeed } from './price.js';
import { rewardsSummary } from '../game/dto.js';

const REQUEST_TTL_S = 10 * 60;
const IN_FLIGHT: WithdrawalStatus[] = [
  'awaiting_signature',
  'signed',
  'submitted',
  'voucher_issued',
  'failed',
];

interface WithdrawalRow {
  id: number;
  farm_id: number;
  amount: string;
  usd_at_request: string;
  destination: string;
  nonce: string;
  request_deadline: string | number | bigint;
  expiry: string | number | bigint | null;
  voucher_signature: string | null;
  tx_hash: string | null;
  status: WithdrawalStatus;
  error: string | null;
  created_at: Date | string;
}

const SELECT = `SELECT id, farm_id, amount::text AS amount, usd_at_request::text AS usd_at_request, destination, nonce::text AS nonce,
  request_deadline, expiry, voucher_signature, tx_hash, status, error, created_at FROM withdrawals`;

export class WithdrawalService {
  constructor(
    private deps: {
      db: Db;
      game: GameService;
      config: ConfigStore;
      price: PriceFeed;
      chain: ChainService | null;
      decimals: number;
      symbol: string;
      voucherTtlSeconds: number;
    },
  ) {}

  private dto(r: WithdrawalRow): WithdrawalDTO {
    const explorer = this.deps.chain?.info.explorerUrl;
    return {
      id: Number(r.id),
      amountUnits: r.amount,
      usdAtRequest: Number(r.usd_at_request),
      destination: r.destination,
      status: r.status,
      txHash: r.tx_hash,
      explorerUrl: r.tx_hash && explorer ? `${explorer.replace(/\/$/, '')}/tx/${r.tx_hash}` : null,
      createdAt: new Date(r.created_at).toISOString(),
      error: r.error,
    };
  }

  async overview(farmId: number): Promise<RewardsDTO> {
    const { db, config, price } = this.deps;
    const s = await loadState(db, farmId, false);
    const summary = rewardsSummary(s, {
      config: await config.get(),
      price: await price.get(),
      decimals: this.deps.decimals,
      symbol: this.deps.symbol,
      rewardsEnabled: !!this.deps.chain,
      now: Date.now(),
    });
    const w = await db.query<WithdrawalRow>(
      `${SELECT} WHERE farm_id = $1 AND status <> 'cancelled' ORDER BY id DESC LIMIT 30`,
      [farmId],
    );
    const h = await db.query<{ ts: Date; usd_value: string; nvda: string; boosted: boolean }>(
      'SELECT ts, usd_value::text AS usd_value, nvda_amount::text AS nvda, boosted FROM harvests WHERE farm_id = $1 ORDER BY id DESC LIMIT 20',
      [farmId],
    );
    return {
      summary,
      chain: this.deps.chain?.info ?? null,
      withdrawals: w.rows.map((r) => this.dto(r)),
      harvests: h.rows.map((r) => ({
        ts: new Date(r.ts).toISOString(),
        usd: Number(r.usd_value),
        nvdaUnits: r.nvda,
        boosted: r.boosted,
      })),
    };
  }

  async prepare(farmId: number): Promise<WithdrawPrepareDTO> {
    const chain = this.deps.chain;
    if (!chain)
      fail(
        'disabled',
        "Withdrawals aren't available yet. Your rewards are safe and keep piling up.",
      );
    const cfg = await this.deps.config.get();
    if (cfg.withdrawalsPaused)
      fail('paused', 'Withdrawals are paused for maintenance. Your rewards are safe.');
    const quote = await this.deps.price.get();
    if (!quote)
      fail('no_price', "We can't get the NVDA price right now. Please try again in a bit.");
    // Never sign more than the contract will pay: it rejects claims above its limits,
    // and a claim the pool can't cover would only fail on-chain.
    const [limits, poolBalance] = await Promise.all([
      chain.claimLimits().catch(() => null),
      chain.contractBalance().catch(() => null),
    ]);
    if (!limits || poolBalance === null)
      fail('chain_unavailable', "We can't reach Robinhood Chain right now. Please try again soon.");

    const { result } = await this.deps.game.withFarm(
      farmId,
      async (s, _ctx, tx) => {
        await this.expireStaleRequests(tx, farmId);
        const busy = await tx.query(
          `SELECT 1 FROM withdrawals WHERE farm_id = $1 AND status = ANY($2::text[])`,
          [farmId, IN_FLIGHT],
        );
        if (busy.rows.length)
          fail('in_flight', 'You already have a withdrawal on its way. Give it a minute.');
        const pending = s.pendingUnits;
        const pendingUsd = tokenUnitsToUsd(pending, quote.price, this.deps.decimals);
        if (pending <= 0n || pendingUsd < cfg.rewards.withdrawMinUsd) {
          fail(
            'below_min',
            `You need at least $${cfg.rewards.withdrawMinUsd.toFixed(2)} in rewards to withdraw.`,
          );
        }
        // Cap to the per-claim limit and today's remaining budget; the rest stays pending.
        let amount = pending;
        if (amount > limits.maxClaim) amount = limits.maxClaim;
        if (amount > limits.remaining) amount = limits.remaining;
        if (amount > poolBalance) {
          fail(
            'pool_empty',
            'The rewards pool is being topped up right now. Your rewards are safe — please try again later.',
          );
        }
        const usd = tokenUnitsToUsd(amount, quote.price, this.deps.decimals);
        if (amount <= 0n || usd < cfg.rewards.withdrawMinUsd) {
          fail(
            'daily_cap',
            "Today's reward budget for all farmers is used up. Your rewards are safe — try again tomorrow.",
          );
        }
        const nonce = BigInt('0x' + randomBytes(16).toString('hex'));
        const deadline = BigInt(Math.floor(Date.now() / 1000) + REQUEST_TTL_S);
        const destination = getAddress(s.farm.address);
        const ins = await tx.query<{ id: number }>(
          `INSERT INTO withdrawals (farm_id, amount, usd_at_request, destination, nonce, request_deadline, status)
           VALUES ($1, $2::numeric, $3, $4, $5::numeric, $6, 'awaiting_signature') RETURNING id`,
          [
            farmId,
            amount.toString(),
            usd.toFixed(6),
            destination,
            nonce.toString(),
            deadline.toString(),
          ],
        );
        return { id: Number(ins.rows[0]!.id), amount, usd, nonce, deadline, destination };
      },
      { advance: false },
    );

    return {
      withdrawalId: result.id,
      amountUnits: result.amount.toString(),
      usd: result.usd,
      typedData: {
        domain: chain.withdrawDomain(),
        types: WITHDRAW_REQUEST_TYPES,
        primaryType: 'WithdrawRequest',
        message: {
          player: result.destination,
          destination: result.destination,
          amount: result.amount.toString(),
          requestId: result.nonce.toString(),
          deadline: result.deadline.toString(),
        },
      },
    };
  }

  async submit(
    farmId: number,
    withdrawalId: number,
    signature: Hex,
  ): Promise<WithdrawSubmitResponse> {
    const chain = this.deps.chain;
    if (!chain) fail('disabled', "Withdrawals aren't available yet.");
    const cfg = await this.deps.config.get();
    if (cfg.withdrawalsPaused)
      fail('paused', 'Withdrawals are paused for maintenance. Your rewards are safe.');

    const row = (
      await this.deps.db.query<WithdrawalRow>(`${SELECT} WHERE id = $1 AND farm_id = $2`, [
        withdrawalId,
        farmId,
      ])
    ).rows[0];
    if (!row || row.status !== 'awaiting_signature')
      fail('bad_request', 'That withdrawal request is no longer valid. Start again.');
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (BigInt(row.request_deadline) < now) fail('expired', 'That request expired. Start again.');

    const player = getAddress(row.destination) as Address;
    const amount = BigInt(row.amount);
    const nonce = BigInt(row.nonce);
    const ok = await chain
      .verifyWithdrawRequest({
        player,
        destination: player,
        amount,
        requestId: nonce,
        deadline: BigInt(row.request_deadline),
        signature,
      })
      .catch(() => false);
    if (!ok) fail('bad_signature', "That signature doesn't match your wallet.");

    const voucher: Voucher = {
      player,
      amount,
      nonce,
      expiry: now + BigInt(this.deps.voucherTtlSeconds),
    };
    const voucherSig = await chain.signVoucher(voucher);

    // Pre-flight: never deduct if the contract would reject (paused, ceiling, low balance).
    const simError = await chain.simulateClaim(voucher, voucherSig);
    if (simError) {
      await this.deps.db.query(
        `UPDATE withdrawals SET status='cancelled', error=$2, updated_at=now() WHERE id=$1`,
        [withdrawalId, simError.slice(0, 300)],
      );
      console.warn(`[withdraw] simulation failed for #${withdrawalId}: ${simError}`);
      fail(
        'busy',
        'Withdrawals are busy right now. Your rewards are safe — please try again later.',
      );
    }

    // Deduct pending and record the voucher atomically under the farm lock.
    await this.deps.game.withFarm(
      farmId,
      async (s, _ctx, tx) => {
        const cur = (
          await tx.query<{ status: string }>(
            'SELECT status FROM withdrawals WHERE id=$1 FOR UPDATE',
            [withdrawalId],
          )
        ).rows[0];
        if (cur?.status !== 'awaiting_signature')
          fail('bad_request', 'That withdrawal request is no longer valid.');
        if (s.pendingUnits < amount) fail('below_min', 'Your rewards changed. Start again.');
        s.pendingUnits -= amount;
        await tx.query(
          `UPDATE withdrawals SET status=$2, expiry=$3, voucher_signature=$4, player_signature=$5, updated_at=now() WHERE id=$1`,
          [
            withdrawalId,
            chain.submitClaim ? 'signed' : 'voucher_issued',
            voucher.expiry.toString(),
            voucherSig,
            signature,
          ],
        );
      },
      { advance: false },
    );

    let response: WithdrawSubmitResponse;
    if (chain.submitClaim) {
      await this.relay(withdrawalId, voucher, voucherSig);
      response = { withdrawal: await this.get(farmId, withdrawalId) };
    } else {
      response = {
        withdrawal: await this.get(farmId, withdrawalId),
        voucher: {
          player,
          amount: amount.toString(),
          nonce: nonce.toString(),
          expiry: voucher.expiry.toString(),
          signature: voucherSig,
          distributor: chain.info.distributor!,
        },
      };
    }
    return response;
  }

  /** Player-submitted claim (no sponsorship): record the tx hash for tracking. */
  async recordTx(farmId: number, withdrawalId: number, txHash: Hex): Promise<WithdrawalDTO> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) fail('bad_tx', 'That transaction hash looks wrong.');
    await this.deps.db.query(
      `UPDATE withdrawals SET tx_hash=$3, status='submitted', updated_at=now() WHERE id=$1 AND farm_id=$2 AND status='voucher_issued'`,
      [withdrawalId, farmId, txHash],
    );
    return this.get(farmId, withdrawalId);
  }

  async get(farmId: number, id: number): Promise<WithdrawalDTO> {
    const r = (
      await this.deps.db.query<WithdrawalRow>(`${SELECT} WHERE id=$1 AND farm_id=$2`, [id, farmId])
    ).rows[0];
    if (!r) fail('not_found', 'Withdrawal not found.', 404);
    return this.dto(r);
  }

  private async relay(id: number, v: Voucher, sig: Hex): Promise<void> {
    try {
      const hash = await this.deps.chain!.submitClaim!(v, sig);
      await this.deps.db.query(
        `UPDATE withdrawals SET tx_hash=$2, status='submitted', error=NULL, updated_at=now() WHERE id=$1`,
        [id, hash],
      );
    } catch (e) {
      const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
      console.error(`[withdraw] relay failed for #${id}: ${msg}`);
      await this.deps.db.query(`UPDATE withdrawals SET error=$2, updated_at=now() WHERE id=$1`, [
        id,
        msg.slice(0, 300),
      ]);
    }
  }

  private async expireStaleRequests(q: Queryable, farmId: number): Promise<void> {
    await q.query(
      `UPDATE withdrawals SET status='cancelled', updated_at=now() WHERE farm_id=$1 AND status='awaiting_signature' AND request_deadline < $2`,
      [farmId, Math.floor(Date.now() / 1000)],
    );
  }

  /** Background reconciliation. Safe to run repeatedly. */
  async reconcile(): Promise<void> {
    const chain = this.deps.chain;
    if (!chain) return;
    const now = BigInt(Math.floor(Date.now() / 1000));
    await this.deps.db.query(
      `UPDATE withdrawals SET status='cancelled', updated_at=now() WHERE status='awaiting_signature' AND request_deadline < $1`,
      [now.toString()],
    );
    const rows = (
      await this.deps.db.query<WithdrawalRow>(
        `${SELECT} WHERE status IN ('signed','submitted','voucher_issued','failed') ORDER BY id LIMIT 100`,
      )
    ).rows;
    for (const r of rows) {
      try {
        const nonce = BigInt(r.nonce);
        const expiry = BigInt(r.expiry ?? 0);
        if (r.tx_hash && r.status === 'submitted') {
          const st = await chain.receiptStatus(r.tx_hash as Hex);
          if (st === 'success') {
            await this.confirm(r);
            continue;
          }
          if (st === 'reverted') {
            await this.deps.db.query(
              `UPDATE withdrawals SET status='failed', error='Transaction reverted', updated_at=now() WHERE id=$1`,
              [r.id],
            );
          }
        }
        if (await chain.nonceUsed(nonce)) {
          await this.confirm(r);
          continue;
        }
        if (r.status === 'signed' && !r.tx_hash && expiry > now + 60n && r.voucher_signature) {
          // Relay never went through: retry.
          await this.relay(
            Number(r.id),
            { player: getAddress(r.destination), amount: BigInt(r.amount), nonce, expiry },
            r.voucher_signature as Hex,
          );
          continue;
        }
        // Expired and unused on-chain → the voucher can never be claimed. Refund.
        if (expiry > 0n && now > expiry + 60n) await this.refund(r);
      } catch (e) {
        console.warn(`[withdraw] reconcile #${r.id}: ${(e as Error).message}`);
      }
    }
  }

  private async confirm(r: WithdrawalRow): Promise<void> {
    const upd = await this.deps.db.query(
      `UPDATE withdrawals SET status='confirmed', error=NULL, updated_at=now() WHERE id=$1 AND status <> 'confirmed' RETURNING id`,
      [r.id],
    );
    if (upd.rows.length) {
      await this.deps.db.query(
        'INSERT INTO mail (farm_id, day, template_id, params) SELECT id, day, $2, $3 FROM farms WHERE id=$1',
        [
          r.farm_id,
          'withdraw_done',
          JSON.stringify({ amount: formatTokenUnits(BigInt(r.amount), this.deps.decimals) }),
        ],
      );
    }
  }

  private async refund(r: WithdrawalRow): Promise<void> {
    await this.deps.game.withFarm(
      Number(r.farm_id),
      async (s, _ctx, tx) => {
        const cur = (
          await tx.query<{ status: string }>(
            'SELECT status FROM withdrawals WHERE id=$1 FOR UPDATE',
            [r.id],
          )
        ).rows[0];
        if (!cur || !['signed', 'submitted', 'voucher_issued', 'failed'].includes(cur.status))
          return;
        s.pendingUnits += BigInt(r.amount);
        await tx.query(`UPDATE withdrawals SET status='refunded', updated_at=now() WHERE id=$1`, [
          r.id,
        ]);
      },
      { advance: false },
    );
  }
}
