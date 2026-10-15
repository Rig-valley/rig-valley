/** Server configuration from environment variables. See `.env.example`. */
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const hexKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex private key')
  .optional()
  .or(z.literal('').transform(() => undefined));

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x address')
  .optional()
  .or(z.literal('').transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(8787),
  /** Postgres connection string. Empty = embedded PGlite (dev only). */
  DATABASE_URL: z.string().optional(),
  /** Directory for the embedded PGlite database. "memory" for tests. */
  PGLITE_DIR: z.string().default('.data/pglite'),

  /** Allowed browser origins (comma separated). */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  /** SIWE domain and URI the client signs for. */
  SIWE_DOMAIN: z.string().default('localhost:5173'),
  SIWE_URI: z.string().default('http://localhost:5173'),
  SESSION_DAYS: z.coerce.number().default(14),
  COOKIE_SECURE: bool,
  /** Serve the built game (client/dist) at / and the admin panel (admin/dist) at /admin/. */
  SERVE_STATIC: bool,
  /** Public host (e.g. rigvalley.com). Requests to any other host get a 301 to it. */
  CANONICAL_HOST: z.string().optional(),

  ADMIN_TOKEN: z.string().min(16, 'ADMIN_TOKEN must be at least 16 characters').optional(),

  // --- Chain (Robinhood Chain). VERIFY all values against official docs. ---
  CHAIN_ID: z.coerce.number().default(46630),
  CHAIN_NAME: z.string().default('Robinhood Chain'),
  RPC_URL: z.string().optional(),
  /** RPC URL handed to browsers (defaults to RPC_URL). Don't expose a private/keyed RPC here. */
  PUBLIC_RPC_URL: z.string().optional(),
  EXPLORER_URL: z.string().default('https://explorer.testnet.chain.robinhood.com'),
  /** NVDA Stock Token. VERIFY against Robinhood's official contract list only. */
  NVDA_TOKEN_ADDRESS: address,
  NVDA_DECIMALS: z.coerce.number().int().min(0).max(36).default(18),
  NVDA_SYMBOL: z.string().default('NVDA'),
  DISTRIBUTOR_ADDRESS: address,
  /** Signs withdrawal vouchers. Cannot move funds by itself. */
  VOUCHER_SIGNER_KEY: hexKey,
  /** Pays gas for claim() calls only. Leave empty to let players pay their own gas. */
  RELAYER_PRIVATE_KEY: hexKey,
  VOUCHER_TTL_SECONDS: z.coerce.number().default(30 * 60),

  // --- Price feed ---
  PRICE_FEED: z.enum(['static', 'http', 'chainlink']).default('static'),
  NVDA_USD_PRICE: z.coerce.number().positive().optional(),
  PRICE_HTTP_URL: z.string().optional(),
  /** Dot path to the price in the JSON response, e.g. "data.price". */
  PRICE_HTTP_PATH: z.string().default('price'),
  CHAINLINK_FEED_ADDRESS: address,
  PRICE_MAX_AGE_SECONDS: z.coerce.number().default(24 * 3600),

  /** Optional webhook (POST JSON) for low-balance alerts. */
  ALERT_WEBHOOK_URL: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    if (!cfg.DATABASE_URL) throw new Error('DATABASE_URL is required in production.');
    if (!cfg.ADMIN_TOKEN) throw new Error('ADMIN_TOKEN is required in production.');
  }
  return cfg;
}

export function chainEnabled(cfg: Config): boolean {
  return !!(
    cfg.RPC_URL &&
    cfg.DISTRIBUTOR_ADDRESS &&
    cfg.NVDA_TOKEN_ADDRESS &&
    cfg.VOUCHER_SIGNER_KEY
  );
}
