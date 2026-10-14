/**
 * End-to-end withdrawal against a local anvil node (skipped if none is running):
 *   anvil --chain-id 46630 & (cd contracts && forge build) && pnpm --filter @rig-valley/server test
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseUnits,
  type Abi,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import type { FastifyInstance } from 'fastify';
import {
  ERC20_ABI,
  WITHDRAW_REQUEST_TYPES,
  type RewardsDTO,
  type StateDTO,
  type WithdrawPrepareDTO,
  type WithdrawSubmitResponse,
} from '@rig-valley/shared';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';
import { openDb } from '../src/db/index.js';
import type { WithdrawalService } from '../src/rewards/withdrawals.js';

const RPC = 'http://127.0.0.1:8545';
// Anvil's default, publicly known test keys (local chain only, never real funds).
const DEPLOYER = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const SIGNER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const RELAYER = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as Hex;
const ADMIN = 'e2e-admin-token-abcdef';

const chainUp = await createPublicClient({ transport: http(RPC) })
  .getChainId()
  .then(() => true)
  .catch(() => false);
const artifactsDir = join(import.meta.dirname, '../../contracts/out');
const haveArtifacts = existsSync(join(artifactsDir, 'RigValleyDistributor.sol'));

function artifact(name: string) {
  const j = JSON.parse(readFileSync(join(artifactsDir, `${name}.sol`, `${name}.json`), 'utf8')) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

function signRequest(
  acct: ReturnType<typeof privateKeyToAccount>,
  td: WithdrawPrepareDTO['typedData'],
) {
  return acct.signTypedData({
    domain: td.domain,
    types: WITHDRAW_REQUEST_TYPES,
    primaryType: 'WithdrawRequest',
    message: {
      player: td.message.player as Hex,
      destination: td.message.destination as Hex,
      amount: BigInt(td.message.amount),
      requestId: BigInt(td.message.requestId),
      deadline: BigInt(td.message.deadline),
    },
  });
}

describe.skipIf(!chainUp || !haveArtifacts)('withdrawal end-to-end (anvil)', () => {
  let app: FastifyInstance;
  let withdrawals: WithdrawalService;
  let token: Hex;
  let distributor: Hex;
  const player = privateKeyToAccount(generatePrivateKey());
  let cookie = '';
  const chain = defineChain({
    id: 46630,
    name: 'anvil',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });
  const pub = createPublicClient({ chain, transport: http(RPC) });

  beforeAll(async () => {
    const deployer = privateKeyToAccount(DEPLOYER);
    const w = createWalletClient({ account: deployer, chain, transport: http(RPC) });
    const t = artifact('MockStockToken');
    const d = artifact('RigValleyDistributor');
    token = (
      await pub.waitForTransactionReceipt({
        hash: await w.deployContract({
          abi: t.abi,
          bytecode: t.bytecode,
          args: ['NVDA Test', 'NVDA', 18, deployer.address],
        }),
      })
    ).contractAddress!;
    distributor = (
      await pub.waitForTransactionReceipt({
        hash: await w.deployContract({
          abi: d.abi,
          bytecode: d.bytecode,
          args: [
            token,
            deployer.address,
            privateKeyToAccount(SIGNER).address,
            privateKeyToAccount(RELAYER).address,
            86400n,
            parseUnits('500', 18),
            parseUnits('50', 18),
          ],
        }),
      })
    ).contractAddress!;
    await pub.waitForTransactionReceipt({
      hash: await w.writeContract({
        address: token,
        abi: t.abi,
        functionName: 'mint',
        args: [distributor, parseUnits('1000', 18)],
      }),
    });

    const cfg = loadConfig({
      NODE_ENV: 'test',
      ADMIN_TOKEN: ADMIN,
      PRICE_FEED: 'static',
      NVDA_USD_PRICE: '200',
      CHAIN_ID: '46630',
      RPC_URL: RPC,
      NVDA_TOKEN_ADDRESS: token,
      DISTRIBUTOR_ADDRESS: distributor,
      VOUCHER_SIGNER_KEY: SIGNER,
      RELAYER_PRIVATE_KEY: RELAYER,
    } as NodeJS.ProcessEnv);
    const db = await openDb({ pgliteDir: 'memory' });
    const srv = await createServer(cfg, { db });
    app = srv.app;
    withdrawals = srv.withdrawals;

    // Make one harvest worth more than $5 so the test doesn't need 60 harvests.
    await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { authorization: `Bearer ${ADMIN}` },
      payload: {
        rewards: {
          normalUsdPerHarvest: 0.02,
          boostUsdPerHarvest: 6,
          boostHarvestCount: 60,
          withdrawMinUsd: 5,
        },
      },
    });

    const { nonce } = (await app.inject({ method: 'GET', url: '/api/auth/nonce' })).json();
    const message = createSiweMessage({
      address: player.address,
      chainId: 46630,
      domain: cfg.SIWE_DOMAIN,
      nonce,
      uri: cfg.SIWE_URI,
      version: '1',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature: await player.signMessage({ message }) },
    });
    cookie = `rv_session=${res.cookies.find((c) => c.name === 'rv_session')!.value}`;
    await app.inject({
      method: 'POST',
      url: '/api/farm',
      headers: { cookie },
      payload: { farmName: 'Chain Farm', character: { name: 'Eve', hair: 'mint', hat: 'none' } },
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const act = async (payload: object) =>
    (
      await app.inject({ method: 'POST', url: '/api/action', headers: { cookie }, payload })
    ).json() as { state: StateDTO };

  it('locks withdraw below $5', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/rewards/withdraw/prepare',
      headers: { cookie },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('below_min');
  });

  it('harvests, withdraws with sponsored gas, and the player receives NVDA', async () => {
    const s0 = (
      await app.inject({ method: 'GET', url: '/api/state', headers: { cookie } })
    ).json() as StateDTO;
    const rigId = s0.rigs[0]!.id;
    await act({ type: 'open_box' });
    await act({ type: 'install', rigId, itemId: 'cpu_common' });
    await act({ type: 'power', rigId, on: true });
    await act({ type: 'sleep' });
    const after = await act({ type: 'claim', rigId });
    expect(after.state.rewards.unlocked).toBe(true);
    // $6 at $200 = 0.03 NVDA
    expect(after.state.rewards.pendingUnits).toBe(parseUnits('0.03', 18).toString());

    const prep = (
      await app.inject({
        method: 'POST',
        url: '/api/rewards/withdraw/prepare',
        headers: { cookie },
      })
    ).json() as WithdrawPrepareDTO;
    const td = prep.typedData;
    const signature = await signRequest(player, td);

    // A signature from someone else is rejected.
    const evil = privateKeyToAccount(generatePrivateKey());
    const badSig = await signRequest(evil, td);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/rewards/withdraw',
      headers: { cookie },
      payload: { withdrawalId: prep.withdrawalId, signature: badSig },
    });
    expect(bad.statusCode).toBe(400);

    const sub = await app.inject({
      method: 'POST',
      url: '/api/rewards/withdraw',
      headers: { cookie },
      payload: { withdrawalId: prep.withdrawalId, signature },
    });
    expect(sub.statusCode).toBe(200);
    const body = sub.json() as WithdrawSubmitResponse;
    expect(body.voucher).toBeUndefined(); // sponsored: relayer submits
    expect(body.withdrawal.status).toBe('submitted');
    await pub.waitForTransactionReceipt({ hash: body.withdrawal.txHash as Hex });

    const bal = await pub.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [player.address],
    });
    expect(bal).toBe(parseUnits('0.03', 18));
    expect(await pub.getBalance({ address: player.address })).toBe(0n); // player paid no gas

    await withdrawals.reconcile();
    const ov = (
      await app.inject({ method: 'GET', url: '/api/rewards', headers: { cookie } })
    ).json() as RewardsDTO;
    expect(ov.withdrawals[0]!.status).toBe('confirmed');
    expect(ov.summary.pendingUnits).toBe('0');

    // Replaying the same request is refused.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/rewards/withdraw',
      headers: { cookie },
      payload: { withdrawalId: prep.withdrawalId, signature },
    });
    expect(replay.statusCode).toBe(400);
  }, 60_000);
});
