/** Wires all services together. */
import type { Hex } from 'viem';
import type { Config } from './config.js';
import { openDb, type Db } from './db/index.js';
import { ConfigStore } from './configStore.js';
import { AuthService } from './auth/auth.js';
import { GameService } from './game/service.js';
import { createPriceFeed } from './rewards/price.js';
import { createChainService } from './rewards/chain.js';
import { WithdrawalService } from './rewards/withdrawals.js';
import { AdminService, BalanceMonitor } from './admin/admin.js';
import { buildApp } from './app.js';

export async function createServer(cfg: Config, opts: { db?: Db; now?: () => number } = {}) {
  const db =
    opts.db ?? (await openDb({ databaseUrl: cfg.DATABASE_URL, pgliteDir: cfg.PGLITE_DIR }));
  const config = new ConfigStore(db);
  const price = createPriceFeed(cfg, config);
  const chain = createChainService(cfg);
  const auth = new AuthService(db, {
    domain: cfg.SIWE_DOMAIN,
    uri: cfg.SIWE_URI,
    sessionDays: cfg.SESSION_DAYS,
    verifyContractSignature: chain
      ? ({ address, message, signature }) =>
          chain.public.verifyMessage({ address, message, signature: signature as Hex })
      : undefined,
  });
  const game = new GameService({
    db,
    config,
    price,
    decimals: cfg.NVDA_DECIMALS,
    symbol: cfg.NVDA_SYMBOL,
    rewardsEnabled: () => !!chain,
    now: opts.now,
  });
  const withdrawals = new WithdrawalService({
    db,
    game,
    config,
    price,
    chain,
    decimals: cfg.NVDA_DECIMALS,
    symbol: cfg.NVDA_SYMBOL,
    voucherTtlSeconds: cfg.VOUCHER_TTL_SECONDS,
  });
  const monitor = new BalanceMonitor(chain, config, cfg.ALERT_WEBHOOK_URL, cfg.NVDA_SYMBOL);
  const admin = new AdminService({
    db,
    config,
    price,
    chain,
    monitor,
    game,
    decimals: cfg.NVDA_DECIMALS,
    symbol: cfg.NVDA_SYMBOL,
  });
  const app = await buildApp({
    cfg,
    db,
    config,
    auth,
    game,
    withdrawals,
    admin,
    chainInfo: chain?.info ?? null,
  });
  return { app, db, game, withdrawals, monitor, chain, config };
}
