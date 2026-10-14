/** Admin panel backend (MASTERPLAN §13). */
import type { AdminDashboardDTO, AdminPlayerDTO, WithdrawalDTO } from '@rig-valley/shared';
import type { Db } from '../db/index.js';
import type { ConfigStore } from '../configStore.js';
import type { PriceFeed } from '../rewards/price.js';
import type { ChainService } from '../rewards/chain.js';
import type { GameService } from '../game/service.js';
import { findFarmId } from '../game/state.js';
import { fail } from '../errors.js';

export interface MonitorState {
  balance: bigint | null;
  paused: boolean | null;
  checkedAt: number;
  error: string | null;
}

/** Polls the distribution contract and raises low-balance alerts. */
export class BalanceMonitor {
  state: MonitorState = { balance: null, paused: null, checkedAt: 0, error: null };
  private lastAlertAt = 0;

  constructor(
    private chain: ChainService | null,
    private config: ConfigStore,
    private webhook: string | undefined,
    private symbol: string,
  ) {}

  async check(): Promise<void> {
    if (!this.chain) return;
    try {
      const [balance, paused] = await Promise.all([
        this.chain.contractBalance(),
        this.chain.contractPaused(),
      ]);
      this.state = { balance, paused, checkedAt: Date.now(), error: null };
      const threshold = BigInt((await this.config.get()).alertThresholdUnits);
      if (balance < threshold && Date.now() - this.lastAlertAt > 3600_000) {
        this.lastAlertAt = Date.now();
        const text = `Rig Valley: distribution contract balance is low (${balance} ${this.symbol} units < threshold ${threshold}). Top it up from the treasury.`;
        console.warn(`[alert] ${text}`);
        if (this.webhook) {
          await fetch(this.webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(5000),
          }).catch((e) => console.warn('[alert] webhook failed:', (e as Error).message));
        }
      }
    } catch (e) {
      this.state = { ...this.state, error: (e as Error).message, checkedAt: Date.now() };
    }
  }
}

export class AdminService {
  constructor(
    private deps: {
      db: Db;
      config: ConfigStore;
      price: PriceFeed;
      chain: ChainService | null;
      monitor: BalanceMonitor;
      game: GameService;
      decimals: number;
      symbol: string;
    },
  ) {}

  async audit(action: string, details: unknown): Promise<void> {
    await this.deps.db.query('INSERT INTO admin_audit (action, details) VALUES ($1, $2)', [
      action,
      JSON.stringify(details ?? {}),
    ]);
  }

  async dashboard(): Promise<AdminDashboardDTO> {
    const { db, config, price, chain, monitor } = this.deps;
    const cfg = await config.get();
    const q = await price.get();
    const sum = async (sql: string) =>
      (await db.query<{ v: string | null }>(sql)).rows[0]?.v ?? '0';
    const count = async (sql: string) =>
      Number((await db.query<{ c: string | number | bigint }>(sql)).rows[0]?.c ?? 0);

    const [paidToday, paidWeek, pending, wToday, wWeek, wPending, players, harvestsToday] =
      await Promise.all([
        sum(
          `SELECT COALESCE(SUM(amount),0)::text AS v FROM withdrawals WHERE status='confirmed' AND updated_at >= date_trunc('day', now())`,
        ),
        sum(
          `SELECT COALESCE(SUM(amount),0)::text AS v FROM withdrawals WHERE status='confirmed' AND updated_at >= now() - interval '7 days'`,
        ),
        sum(
          `SELECT (COALESCE((SELECT SUM(amount) FROM nvda_pending),0) + COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('signed','submitted','voucher_issued','failed')),0))::text AS v`,
        ),
        count(
          `SELECT COUNT(*) AS c FROM withdrawals WHERE status='confirmed' AND updated_at >= date_trunc('day', now())`,
        ),
        count(
          `SELECT COUNT(*) AS c FROM withdrawals WHERE status='confirmed' AND updated_at >= now() - interval '7 days'`,
        ),
        count(
          `SELECT COUNT(*) AS c FROM withdrawals WHERE status IN ('signed','submitted','voucher_issued','failed')`,
        ),
        count(`SELECT COUNT(*) AS c FROM farms`),
        count(`SELECT COUNT(*) AS c FROM harvests WHERE ts >= date_trunc('day', now())`),
      ]);

    const threshold = BigInt(cfg.alertThresholdUnits);
    const bal = monitor.state.balance;
    const low = bal !== null && bal < threshold;
    const alerts: AdminDashboardDTO['alerts'] = [];
    if (low)
      alerts.push({
        level: 'bad',
        text: 'Distribution contract balance is below the alert threshold. Top it up from the treasury.',
      });
    if (bal !== null && BigInt(pending) > bal)
      alerts.push({ level: 'warn', text: 'Pending player rewards exceed the contract balance.' });
    if (!q)
      alerts.push({
        level: 'warn',
        text: 'No NVDA price available. Harvests are being recorded in USD and converted later.',
      });
    if (monitor.state.paused)
      alerts.push({ level: 'warn', text: 'The distribution contract is paused on-chain.' });
    if (monitor.state.error)
      alerts.push({ level: 'warn', text: `Chain check failed: ${monitor.state.error}` });
    if (!chain)
      alerts.push({ level: 'warn', text: 'Chain is not configured. Withdrawals are disabled.' });
    if (cfg.withdrawalsPaused)
      alerts.push({ level: 'warn', text: 'Withdrawals are paused from the admin panel.' });

    return {
      symbol: this.deps.symbol,
      decimals: this.deps.decimals,
      priceUsd: q?.price ?? null,
      priceUpdatedAt: q ? new Date(q.at).toISOString() : null,
      paidTodayUnits: paidToday,
      paidWeekUnits: paidWeek,
      pendingLiabilitiesUnits: pending,
      withdrawalsToday: wToday,
      withdrawalsWeek: wWeek,
      withdrawalsPending: wPending,
      contractBalanceUnits: bal?.toString() ?? null,
      contractPaused: monitor.state.paused,
      lowBalanceAlert: low,
      withdrawalsPaused: cfg.withdrawalsPaused,
      players,
      harvestsToday,
      chain: chain?.info ?? null,
      alerts,
    };
  }

  async player(address: string): Promise<AdminPlayerDTO> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) fail('bad_address', 'Enter a valid wallet address.');
    const farmId = await findFarmId(this.deps.db, address);
    if (!farmId) fail('not_found', 'No farm for that wallet.', 404);
    const { db } = this.deps;
    const state = await this.deps.game.getState(farmId);
    const harvests = await db.query<{
      ts: Date;
      rig_id: number;
      coins: number;
      usd_value: string;
      nvda: string;
      price_used: string | null;
      boosted: boolean;
    }>(
      `SELECT ts, rig_id, coins, usd_value::text AS usd_value, nvda_amount::text AS nvda, price_used::text AS price_used, boosted
       FROM harvests WHERE farm_id=$1 ORDER BY id DESC LIMIT 200`,
      [farmId],
    );
    const withdrawals = await db.query<{
      id: number;
      amount: string;
      usd_at_request: string;
      destination: string;
      status: WithdrawalDTO['status'];
      tx_hash: string | null;
      created_at: Date;
      error: string | null;
    }>(
      `SELECT id, amount::text AS amount, usd_at_request::text AS usd_at_request, destination, status, tx_hash, created_at, error
       FROM withdrawals WHERE farm_id=$1 ORDER BY id DESC LIMIT 100`,
      [farmId],
    );
    const ledger = await db.query<{ ts: Date; delta: number; reason: string }>(
      'SELECT ts, delta, reason FROM coins_ledger WHERE farm_id=$1 ORDER BY id DESC LIMIT 200',
      [farmId],
    );
    const explorer = this.deps.chain?.info.explorerUrl;
    return {
      state,
      harvests: harvests.rows.map((h) => ({
        ts: new Date(h.ts).toISOString(),
        rigId: Number(h.rig_id),
        coins: Number(h.coins),
        usd: Number(h.usd_value),
        nvdaUnits: h.nvda,
        priceUsed: h.price_used === null ? null : Number(h.price_used),
        boosted: h.boosted,
      })),
      withdrawals: withdrawals.rows.map((w) => ({
        id: Number(w.id),
        amountUnits: w.amount,
        usdAtRequest: Number(w.usd_at_request),
        destination: w.destination,
        status: w.status,
        txHash: w.tx_hash,
        explorerUrl: w.tx_hash && explorer ? `${explorer}/tx/${w.tx_hash}` : null,
        createdAt: new Date(w.created_at).toISOString(),
        error: w.error,
      })),
      coinsLedger: ledger.rows.map((l) => ({
        ts: new Date(l.ts).toISOString(),
        delta: Number(l.delta),
        reason: l.reason,
      })),
    };
  }
}
