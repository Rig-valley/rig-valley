/** HTTP API (Fastify). */
import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { Hex } from 'viem';
import {
  calendar,
  festivalToday,
  marketItems,
  marketQuote,
  HARVEST_NIGHT_SELL_BONUS,
  type CreateFarmRequest,
  type GameAction,
  type MarketDTO,
  type MeDTO,
  type PublicConfigDTO,
  type ChainInfoDTO,
} from '@rig-valley/shared';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { ConfigStore } from './configStore.js';
import type { AuthService } from './auth/auth.js';
import type { GameService } from './game/service.js';
import type { WithdrawalService } from './rewards/withdrawals.js';
import type { AdminService } from './admin/admin.js';
import { GameError, fail } from './errors.js';
import {
  actionSchema,
  adminConfigSchema,
  createFarmSchema,
  tickSchema,
  verifySchema,
} from './schemas.js';
import { loadState } from './game/state.js';

export interface AppDeps {
  cfg: Config;
  db: Db;
  config: ConfigStore;
  auth: AuthService;
  game: GameService;
  withdrawals: WithdrawalService;
  admin: AdminService;
  chainInfo: ChainInfoDTO | null;
}

const COOKIE = 'rv_session';

declare module 'fastify' {
  interface FastifyRequest {
    address?: string;
    farmId?: number;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { cfg, auth, game, withdrawals, admin, config } = deps;
  const app = Fastify({
    logger: cfg.NODE_ENV !== 'test' ? { level: 'info' } : false,
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });
  const origins = cfg.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cookie);
  await app.register(cors, { origin: origins, credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  // CSRF defense: state-changing requests must come from an allowed origin (or same-origin with no Origin header).
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      return reply.code(403).send({ error: 'bad_origin', message: 'Request blocked.' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof GameError)
      return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError)
      return reply
        .code(400)
        .send({ error: 'invalid_request', message: 'That request looks wrong.' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429)
      return reply.code(429).send({ error: 'rate_limited', message: 'Whoa, slow down a little!' });
    if (status && status < 500)
      return reply
        .code(status)
        .send({ error: 'bad_request', message: 'That request looks wrong.' });
    app.log.error(err);
    return reply.code(500).send({
      error: 'server_error',
      message: 'Something went wrong on our side. Please try again.',
    });
  });

  const sessionCookie = (token: string, expires: Date) => ({
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: cfg.COOKIE_SECURE,
    expires,
  });

  async function requireAuth(req: FastifyRequest) {
    const address = await auth.sessionAddress(req.cookies[COOKIE]);
    if (!address) fail('unauthorized', 'Please connect your wallet again.', 401);
    req.address = address;
  }

  async function requireFarm(req: FastifyRequest) {
    await requireAuth(req);
    const id = await game.farmIdFor(req.address!);
    if (!id) fail('no_farm', "You don't have a farm yet.", 404);
    req.farmId = id;
  }

  function requireAdmin(req: FastifyRequest) {
    const token = cfg.ADMIN_TOKEN;
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (
      !token ||
      given.length !== token.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(token))
    ) {
      fail('unauthorized', 'Admin token required.', 401);
    }
  }

  // ------------------------------------------------------------------ health
  app.get('/api/health', async () => ({ ok: true, db: deps.db.kind }));

  app.get(
    '/api/config/public',
    async () =>
      ({
        siwe: { domain: cfg.SIWE_DOMAIN, uri: cfg.SIWE_URI, chainId: cfg.CHAIN_ID },
        chain: deps.chainInfo,
        symbol: cfg.NVDA_SYMBOL,
        decimals: cfg.NVDA_DECIMALS,
      }) satisfies PublicConfigDTO,
  );

  // ------------------------------------------------------------------ auth
  app.get(
    '/api/auth/nonce',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async () => ({
      nonce: await auth.createNonce(),
      domain: cfg.SIWE_DOMAIN,
      uri: cfg.SIWE_URI,
      chainId: cfg.CHAIN_ID,
    }),
  );

  app.post(
    '/api/auth/verify',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = verifySchema.parse(req.body);
      const address = await auth.verify(body.message, body.signature as Hex);
      const { token, expires } = await auth.createSession(address);
      reply.setCookie(COOKIE, token, sessionCookie(token, expires));
      const farmId = await game.farmIdFor(address);
      return { address, hasFarm: !!farmId } satisfies MeDTO;
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    await auth.destroySession(req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  // Returns null (not 401) when signed out: being signed out is a normal state here.
  app.get('/api/me', async (req) => {
    const address = await auth.sessionAddress(req.cookies[COOKIE]);
    if (!address) return null;
    req.address = address;
    const farmId = await game.farmIdFor(req.address!);
    let farmName: string | undefined;
    if (farmId) farmName = (await loadState(deps.db, farmId, false)).farm.farmName;
    return { address: req.address!, hasFarm: !!farmId, farmName } satisfies MeDTO;
  });

  // ------------------------------------------------------------------ farm
  app.get('/api/farm/name-available', async (req) => {
    const name = String((req.query as { name?: string }).name ?? '');
    return { available: name.trim().length >= 3 && (await game.isNameAvailable(name)) };
  });

  app.post(
    '/api/farm',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      await requireAuth(req);
      const body = createFarmSchema.parse(req.body) as CreateFarmRequest;
      return game.createFarm(req.address!, body);
    },
  );

  app.get('/api/state', async (req) => {
    await requireFarm(req);
    return game.getState(req.farmId!);
  });

  app.post(
    '/api/tick',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      await requireFarm(req);
      const { paused } = tickSchema.parse(req.body);
      return game.tick(req.farmId!, paused);
    },
  );

  app.post('/api/action', async (req) => {
    await requireFarm(req);
    const action = actionSchema.parse(req.body) as GameAction;
    return game.act(req.farmId!, action);
  });

  app.get('/api/market', async (req) => {
    await requireFarm(req);
    const s = await loadState(deps.db, req.farmId!, false);
    const cal = calendar(s.farm.day);
    const cfgNow = await config.get();
    const quotes = marketItems()
      .map((i) => marketQuote(cfgNow.market, i.id, s.farm.day, cal.season))
      .filter((q): q is NonNullable<typeof q> => !!q);
    const bonus =
      festivalToday(cal.season, cal.dayOfSeason)?.id === 'harvest_night'
        ? HARVEST_NIGHT_SELL_BONUS
        : 1;
    return { day: s.farm.day, quotes, sellBonus: bonus } satisfies MarketDTO;
  });

  // ------------------------------------------------------------------ rewards
  app.get('/api/rewards', async (req) => {
    await requireFarm(req);
    return withdrawals.overview(req.farmId!);
  });

  app.post(
    '/api/rewards/withdraw/prepare',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      await requireFarm(req);
      return withdrawals.prepare(req.farmId!);
    },
  );

  app.post(
    '/api/rewards/withdraw',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      await requireFarm(req);
      const body = req.body as { withdrawalId?: unknown; signature?: unknown };
      const id = Number(body.withdrawalId);
      const sig = String(body.signature ?? '');
      if (!Number.isInteger(id) || !/^0x[0-9a-fA-F]{130,}$/.test(sig))
        fail('bad_request', 'That request looks wrong.');
      return withdrawals.submit(req.farmId!, id, sig as Hex);
    },
  );

  app.post('/api/rewards/withdrawals/:id/tx', async (req) => {
    await requireFarm(req);
    const id = Number((req.params as { id: string }).id);
    const txHash = String((req.body as { txHash?: string }).txHash ?? '');
    return withdrawals.recordTx(req.farmId!, id, txHash as Hex);
  });

  app.get('/api/rewards/withdrawals/:id', async (req) => {
    await requireFarm(req);
    return withdrawals.get(req.farmId!, Number((req.params as { id: string }).id));
  });

  // ------------------------------------------------------------------ admin
  const adminRoute = {
    preHandler: async (req: FastifyRequest, _reply: FastifyReply) => requireAdmin(req),
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  };

  app.get('/api/admin/dashboard', adminRoute, async () => admin.dashboard());
  app.get('/api/admin/config', adminRoute, async () => config.get());
  app.put('/api/admin/config', adminRoute, async (req) => {
    const patch = adminConfigSchema.parse(req.body);
    const next = await config.set(patch as never);
    await admin.audit('config', patch);
    return next;
  });
  app.post('/api/admin/withdrawals/pause', adminRoute, async () => {
    await config.set({ withdrawalsPaused: true });
    await admin.audit('withdrawals_pause', {});
    return { withdrawalsPaused: true };
  });
  app.post('/api/admin/withdrawals/resume', adminRoute, async () => {
    await config.set({ withdrawalsPaused: false });
    await admin.audit('withdrawals_resume', {});
    return { withdrawalsPaused: false };
  });
  app.get('/api/admin/players/:address', adminRoute, async (req) =>
    admin.player((req.params as { address: string }).address),
  );

  return app;
}
