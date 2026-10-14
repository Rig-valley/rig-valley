/**
 * NVDA/USD price feed (MASTERPLAN §2: VERIFY what is available on Robinhood Chain).
 * Pluggable: static (dev), generic HTTP JSON API, or a Chainlink-style aggregator.
 */
import { createPublicClient, http, type Address } from 'viem';
import type { Config } from '../config.js';
import type { ConfigStore } from '../configStore.js';

export interface PriceQuote {
  price: number;
  at: number;
  source: string;
}

export interface PriceFeed {
  /** Latest price or null if unavailable / too old. */
  get(): Promise<PriceQuote | null>;
  /** Last known price, even if stale. */
  last(): PriceQuote | null;
}

const AGGREGATOR_ABI = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

export function createPriceFeed(cfg: Config, store: ConfigStore): PriceFeed {
  let cached: PriceQuote | null = null;
  let fetchedAt = 0;
  const maxAgeMs = cfg.PRICE_MAX_AGE_SECONDS * 1000;
  let restored = false;

  async function fetchFresh(): Promise<PriceQuote | null> {
    switch (cfg.PRICE_FEED) {
      case 'static':
        return cfg.NVDA_USD_PRICE
          ? { price: cfg.NVDA_USD_PRICE, at: Date.now(), source: 'static' }
          : null;
      case 'http': {
        if (!cfg.PRICE_HTTP_URL) return null;
        const res = await fetch(cfg.PRICE_HTTP_URL, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`price http ${res.status}`);
        const json: unknown = await res.json();
        const value = cfg.PRICE_HTTP_PATH.split('.').reduce<unknown>(
          (o, k) => (o as Record<string, unknown>)?.[k],
          json,
        );
        const price = Number(value);
        if (!Number.isFinite(price) || price <= 0) throw new Error('price http: invalid value');
        return { price, at: Date.now(), source: 'http' };
      }
      case 'chainlink': {
        if (!cfg.CHAINLINK_FEED_ADDRESS || !cfg.RPC_URL) return null;
        const client = createPublicClient({ transport: http(cfg.RPC_URL) });
        const addr = cfg.CHAINLINK_FEED_ADDRESS as Address;
        const [round, decimals] = await Promise.all([
          client.readContract({
            address: addr,
            abi: AGGREGATOR_ABI,
            functionName: 'latestRoundData',
          }),
          client.readContract({ address: addr, abi: AGGREGATOR_ABI, functionName: 'decimals' }),
        ]);
        const answer = round[1];
        const updatedAt = Number(round[3]) * 1000;
        if (answer <= 0n) throw new Error('chainlink: non-positive answer');
        return { price: Number(answer) / 10 ** decimals, at: updatedAt, source: 'chainlink' };
      }
    }
  }

  return {
    last: () => cached,
    async get() {
      if (!restored) {
        restored = true;
        cached = (await store.getRaw<PriceQuote>('last_price')) ?? null;
      }
      if (Date.now() - fetchedAt > 60_000 || !cached) {
        fetchedAt = Date.now();
        try {
          const q = await fetchFresh();
          if (q) {
            cached = q;
            await store.setRaw('last_price', q);
          }
        } catch (e) {
          console.warn('[price] feed error:', (e as Error).message);
        }
      }
      if (!cached || Date.now() - cached.at > maxAgeMs) return null;
      return cached;
    },
  };
}
