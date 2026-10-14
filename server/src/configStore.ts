/** Admin-editable game configuration (MASTERPLAN §13), stored in the `config` table. */
import {
  DEFAULT_MARKET_CONFIG,
  DEFAULT_REWARD_CONFIG,
  type MarketConfig,
  type RewardConfig,
} from '@rig-valley/shared';
import type { Db, Queryable } from './db/index.js';

export interface GameConfig {
  rewards: RewardConfig;
  market: MarketConfig;
  withdrawalsPaused: boolean;
  /** Alert when the distribution contract balance is below this (token units). */
  alertThresholdUnits: string;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  rewards: DEFAULT_REWARD_CONFIG,
  market: DEFAULT_MARKET_CONFIG,
  withdrawalsPaused: false,
  alertThresholdUnits: (50n * 10n ** 18n).toString(),
};

const KEYS = ['rewards', 'market', 'withdrawalsPaused', 'alertThresholdUnits'] as const;

export class ConfigStore {
  private cache: GameConfig | null = null;
  private loadedAt = 0;

  constructor(private db: Db) {}

  async get(): Promise<GameConfig> {
    if (this.cache && Date.now() - this.loadedAt < 5_000) return this.cache;
    const rows = (
      await this.db.query<{ key: string; value: unknown }>('SELECT key, value FROM config')
    ).rows;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const cfg: GameConfig = {
      rewards: { ...DEFAULT_GAME_CONFIG.rewards, ...((map.get('rewards') as object) ?? {}) },
      market: mergeMarket((map.get('market') as Partial<MarketConfig>) ?? {}),
      withdrawalsPaused:
        (map.get('withdrawalsPaused') as boolean) ?? DEFAULT_GAME_CONFIG.withdrawalsPaused,
      alertThresholdUnits:
        (map.get('alertThresholdUnits') as string) ?? DEFAULT_GAME_CONFIG.alertThresholdUnits,
    };
    this.cache = cfg;
    this.loadedAt = Date.now();
    return cfg;
  }

  async set(patch: Partial<GameConfig>, q: Queryable = this.db): Promise<GameConfig> {
    for (const key of KEYS) {
      if (patch[key] === undefined) continue;
      await q.query(
        `INSERT INTO config (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(patch[key])],
      );
    }
    this.cache = null;
    return this.get();
  }

  async getRaw<T>(key: string): Promise<T | undefined> {
    const r = await this.db.query<{ value: T }>('SELECT value FROM config WHERE key = $1', [key]);
    return r.rows[0]?.value;
  }

  async setRaw(key: string, value: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO config (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
}

function mergeMarket(m: Partial<MarketConfig>): MarketConfig {
  const d = DEFAULT_MARKET_CONFIG;
  const seasonal = { ...d.seasonalModifiers };
  for (const s of Object.keys(seasonal) as (keyof typeof seasonal)[]) {
    seasonal[s] = { ...d.seasonalModifiers[s], ...(m.seasonalModifiers?.[s] ?? {}) };
  }
  return {
    basePrices: { ...d.basePrices, ...(m.basePrices ?? {}) },
    seasonalModifiers: seasonal,
    dailySwing: m.dailySwing ?? d.dailySwing,
    sellRatio: m.sellRatio ?? d.sellRatio,
  };
}
