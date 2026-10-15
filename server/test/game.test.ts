import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import type { FastifyInstance } from 'fastify';
import type { ActionResponse, GameAction, StateDTO } from '@rig-valley/shared';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';
import { openDb } from '../src/db/index.js';

let app: FastifyInstance;
let clock = Date.now();
const now = () => clock;

const cfg = loadConfig({
  NODE_ENV: 'test',
  PGLITE_DIR: 'memory',
  ADMIN_TOKEN: 'test-admin-token-123456',
  PRICE_FEED: 'static',
  NVDA_USD_PRICE: '180',
} as NodeJS.ProcessEnv);

beforeAll(async () => {
  const db = await openDb({ pgliteDir: 'memory' });
  ({ app } = await createServer(cfg, { db, now }));
});
afterAll(async () => {
  await app.close();
});

async function login(key = generatePrivateKey()) {
  const account = privateKeyToAccount(key);
  const { nonce } = (await app.inject({ method: 'GET', url: '/api/auth/nonce' })).json();
  const message = createSiweMessage({
    address: account.address,
    chainId: cfg.CHAIN_ID,
    domain: cfg.SIWE_DOMAIN,
    nonce,
    uri: cfg.SIWE_URI,
    version: '1',
    statement: 'Sign in to Rig Valley.',
  });
  const signature = await account.signMessage({ message });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: { message, signature },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'rv_session')!;
  return { account, cookie: `rv_session=${cookie.value}`, message, signature };
}

async function act(cookie: string, action: GameAction): Promise<ActionResponse> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/action',
    payload: action,
    headers: { cookie },
  });
  if (res.statusCode !== 200) throw new Error(`${action.type}: ${res.statusCode} ${res.body}`);
  return res.json();
}

describe('auth', () => {
  it('rejects a replayed SIWE nonce', async () => {
    const { message, signature } = await login();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a signature from another wallet', async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const b = privateKeyToAccount(generatePrivateKey());
    const { nonce } = (await app.inject({ method: 'GET', url: '/api/auth/nonce' })).json();
    const message = createSiweMessage({
      address: a.address,
      chainId: cfg.CHAIN_ID,
      domain: cfg.SIWE_DOMAIN,
      nonce,
      uri: cfg.SIWE_URI,
      version: '1',
    });
    const signature = await b.signMessage({ message });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { message, signature },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests from foreign origins', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('farm lifecycle', () => {
  let cookie: string;
  let state: StateDTO;

  it('creates exactly one farm per wallet with a unique name', async () => {
    ({ cookie } = await login());
    const res = await app.inject({
      method: 'POST',
      url: '/api/farm',
      headers: { cookie },
      payload: { farmName: 'Ray Garage', character: { name: 'Sam', hair: 'copper', hat: 'cap' } },
    });
    expect(res.statusCode).toBe(200);
    state = res.json();
    expect(state.farm.farmName).toBe('Ray Garage');
    expect(state.rigs).toHaveLength(1);
    expect(state.mail.some((m) => m.templateId === 'ray_welcome')).toBe(true);

    const again = await app.inject({
      method: 'POST',
      url: '/api/farm',
      headers: { cookie },
      payload: { farmName: 'Second Farm', character: { name: 'Sam', hair: 'copper', hat: 'cap' } },
    });
    expect(again.statusCode).toBe(409);

    const other = await login();
    const dup = await app.inject({
      method: 'POST',
      url: '/api/farm',
      headers: { cookie: other.cookie },
      payload: { farmName: 'ray garage', character: { name: 'Al', hair: 'ink', hat: 'none' } },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toMatch(/taken/);
  });

  it('runs the tutorial: box → install → power → clean → sleep → claim', async () => {
    const letter = state.mail.find((m) => m.templateId === 'ray_welcome')!;
    state = (await act(cookie, { type: 'read_mail', mailId: letter.id })).state;
    expect(state.farm.tutorialStep).toBe(1);

    state = (await act(cookie, { type: 'open_box' })).state;
    expect(state.inventory.find((i) => i.itemId === 'cpu_common')?.qty).toBe(1);
    const rigId = state.rigs[0]!.id;

    state = (await act(cookie, { type: 'install', rigId, itemId: 'cpu_common' })).state;
    expect(state.rigs[0]!.status).toBe('installed');
    expect(state.farm.energy).toBe(90);

    state = (await act(cookie, { type: 'power', rigId, on: true })).state;
    expect(state.rigs[0]!.status).toBe('booting');

    state = (await act(cookie, { type: 'clean', rigId })).state;
    expect(state.farm.tutorialStep).toBe(5);

    const slept = await act(cookie, { type: 'sleep' });
    state = slept.state;
    expect(state.farm.day).toBe(2);
    expect(state.farm.energy).toBe(100);
    expect(slept.events.some((e) => e.kind === 'sleep')).toBe(true);
    expect(state.rigs[0]!.status).toBe('ready');
    expect(state.farm.tutorialStep).toBe(6);

    const claimed = await act(cookie, { type: 'claim', rigId });
    state = claimed.state;
    const h = claimed.events.find((e) => e.kind === 'harvest');
    expect(h).toMatchObject({ kind: 'harvest', boosted: true, usd: 0.08 });
    expect(BigInt(state.rewards.pendingUnits)).toBeGreaterThan(0n);
    expect(state.farm.tutorialStep).toBe(7);
    // Quest chain continues with Mia's invite.
    expect(state.quests.find((q) => q.questId === 'main_first_harvest')?.state).toBe('done');
    expect(state.quests.some((q) => q.questId === 'main_meet_town')).toBe(true);
  });

  it('refuses bed before bedtime once the tutorial night is over', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/action',
      headers: { cookie },
      payload: { type: 'sleep' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('too_early');
    expect(res.json().message).toMatch(/8:00 PM/);
  });

  it('shows the daily NVDA limit and when withdrawals open for a new farm', async () => {
    const s = (
      await app.inject({ method: 'GET', url: '/api/state', headers: { cookie } })
    ).json() as StateDTO;
    expect(s.rewards.nvdaHarvestsPerDay).toBe(24);
    expect(s.rewards.nvdaHarvestsToday).toBe(1); // the tutorial harvest
    expect(s.rewards.nvdaLimitResetsAt).toBeGreaterThan(Date.now());
    expect(s.rewards.withdrawOpensAt).toBeGreaterThan(Date.now() + 71 * 3_600_000);
    expect(s.farm.billDebt).toBe(0);
    expect(s.farm.powerCut).toBe(false);
  });

  it('advances time only while playing and unpaused', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tick',
      headers: { cookie },
      payload: { paused: false },
    });
    const before = (
      await app.inject({ method: 'GET', url: '/api/state', headers: { cookie } })
    ).json() as StateDTO;
    clock += 7000; // 7 real seconds = 10 game minutes
    let s = (
      await app.inject({
        method: 'POST',
        url: '/api/tick',
        headers: { cookie },
        payload: { paused: true },
      })
    ).json().state as StateDTO;
    expect(Math.round(s.farm.minute - before.farm.minute)).toBe(10);
    clock += 7000; // paused: frozen
    s = (
      await app.inject({
        method: 'POST',
        url: '/api/tick',
        headers: { cookie },
        payload: { paused: false },
      })
    ).json().state;
    expect(Math.round(s.farm.minute - before.farm.minute)).toBe(10);
    clock += 3_600_000; // away for an hour: capped
    s = (
      await app.inject({
        method: 'POST',
        url: '/api/tick',
        headers: { cookie },
        payload: { paused: false },
      })
    ).json().state;
    expect(s.farm.minute - before.farm.minute).toBeLessThan(10 + 15);
  });

  it('enforces shop hours, coins and energy', async () => {
    // 6:xx AM — Hardware Store opens at 9.
    const closed = await app.inject({
      method: 'POST',
      url: '/api/action',
      headers: { cookie },
      payload: { type: 'buy', shopId: 'hardware', itemId: 'thermal_paste', qty: 1 },
    });
    expect(closed.statusCode).toBe(400);
    expect(closed.json().message).toMatch(/closed/);
  });

  it('rejects invalid actions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/action',
      headers: { cookie },
      payload: { type: 'build_rig', x: 'a' },
    });
    expect(res.statusCode).toBe(400);
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/action',
      headers: { cookie },
      payload: { type: 'build_rig', x: 2, y: 2, frameId: 'frame_t1' },
    });
    expect(res2.statusCode).toBe(400);
  });

  it('talks to NPCs and raises friendship once per day', async () => {
    const r1 = await act(cookie, { type: 'talk', npc: 'mia' });
    expect(r1.events.some((e) => e.kind === 'dialogue')).toBe(true);
    const mia = r1.state.relations.find((r) => r.npc === 'mia')!;
    expect(mia.points).toBe(10);
    const r2 = await act(cookie, { type: 'talk', npc: 'mia' });
    expect(r2.state.relations.find((r) => r.npc === 'mia')!.points).toBe(10);
    expect(r2.state.quests.find((q) => q.questId === 'main_meet_town')?.state).toBe('done');
  });

  it('withdrawals are disabled without a chain', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rewards/withdraw/prepare',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('disabled');
  });

  it('passes out at 2 AM with a fee', async () => {
    // Play until 2 AM: 20 game hours = 1200 min = 840 s, in 10 s ticks.
    let s!: StateDTO;
    let passed = false;
    for (let i = 0; i < 100 && !passed; i++) {
      clock += 10_000;
      const r = (
        await app.inject({
          method: 'POST',
          url: '/api/tick',
          headers: { cookie },
          payload: { paused: false },
        })
      ).json() as ActionResponse;
      s = r.state;
      passed = r.events.some((e) => e.kind === 'sleep' && e.summary.passedOut);
    }
    expect(passed).toBe(true);
    expect(s.farm.energy).toBe(50);
    expect(s.farm.day).toBe(3);
  });
});

describe('captcha', () => {
  it('asks for a Turnstile token on farm creation when configured', async () => {
    const withCaptcha = loadConfig({
      NODE_ENV: 'test',
      PGLITE_DIR: 'memory',
      ADMIN_TOKEN: 'test-admin-token-123456',
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    } as NodeJS.ProcessEnv);
    const db = await openDb({ pgliteDir: 'memory' });
    const { app: guarded } = await createServer(withCaptcha, { db });
    try {
      const pub = (await guarded.inject({ method: 'GET', url: '/api/config/public' })).json();
      expect(pub.captchaSiteKey).toBe('1x00000000000000000000AA');
      const account = privateKeyToAccount(generatePrivateKey());
      const { nonce } = (await guarded.inject({ method: 'GET', url: '/api/auth/nonce' })).json();
      const message = createSiweMessage({
        address: account.address,
        chainId: withCaptcha.CHAIN_ID,
        domain: withCaptcha.SIWE_DOMAIN,
        nonce,
        uri: withCaptcha.SIWE_URI,
        version: '1',
      });
      const login = await guarded.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { message, signature: await account.signMessage({ message }) },
      });
      const cookie = `rv_session=${login.cookies.find((c) => c.name === 'rv_session')!.value}`;
      const res = await guarded.inject({
        method: 'POST',
        url: '/api/farm',
        headers: { cookie },
        payload: { farmName: 'Bot Farm', character: { name: 'Bot', hair: 'ink', hat: 'none' } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('captcha');
    } finally {
      await guarded.close();
    }
    expect(() =>
      loadConfig({ NODE_ENV: 'test', TURNSTILE_SITE_KEY: 'x' } as NodeJS.ProcessEnv),
    ).toThrow(/TURNSTILE/);
  });
});

describe('admin', () => {
  it('requires the admin token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/dashboard' })).statusCode).toBe(401);
    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard',
      headers: { authorization: 'Bearer test-admin-token-123456' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().players).toBeGreaterThan(0);
  });

  it('edits reward config without a client update', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { authorization: 'Bearer test-admin-token-123456' },
      payload: {
        rewards: {
          normalUsdPerHarvest: 0.03,
          boostUsdPerHarvest: 0.1,
          boostHarvestCount: 50,
          withdrawMinUsd: 5,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rewards.normalUsdPerHarvest).toBe(0.03);
    // Fields left out keep their values.
    expect(res.json().rewards.dailyNvdaHarvests).toBe(24);
    const limits = await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: { authorization: 'Bearer test-admin-token-123456' },
      payload: {
        rewards: {
          normalUsdPerHarvest: 0.03,
          boostUsdPerHarvest: 0.1,
          boostHarvestCount: 50,
          withdrawMinUsd: 5,
          dailyNvdaHarvests: 12,
          withdrawMinFarmAgeHours: 48,
        },
        relayerAlertWei: '2000000000000000',
      },
    });
    expect(limits.statusCode).toBe(200);
    expect(limits.json().rewards).toMatchObject({
      dailyNvdaHarvests: 12,
      withdrawMinFarmAgeHours: 48,
    });
    expect(limits.json().relayerAlertWei).toBe('2000000000000000');
    const dash = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard',
      headers: { authorization: 'Bearer test-admin-token-123456' },
    });
    expect(dash.json()).toMatchObject({
      relayerAddress: null,
      relayerBalanceWei: null,
      lowRelayerAlert: false,
    });
  });
});
