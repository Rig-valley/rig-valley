/**
 * Shiny scraps: a few spots around the valley sparkle each day. Walking over and
 * searching them pays a little Coins or a useful item, so there is always something
 * worth exploring between bigger goals. Deterministic per farm and day, so the server
 * can validate every find.
 */
import { rngFor } from './rng.js';

/** Walkable tiles spread over the whole map (checked against the map's colliders). */
export const SCRAP_SPOTS: readonly { x: number; y: number }[] = (
  [
    [5, 5],
    [19, 4],
    [31, 6],
    [42, 4],
    [54, 4],
    [67, 4],
    [80, 5],
    [89, 4],
    [7, 12],
    [18, 13],
    [29, 14],
    [43, 13],
    [54, 14],
    [66, 13],
    [78, 13],
    [89, 14],
    [7, 22],
    [18, 23],
    [30, 22],
    [42, 22],
    [53, 23],
    [67, 22],
    [78, 23],
    [90, 22],
    [6, 31],
    [18, 28],
    [31, 31],
    [42, 32],
    [52, 32],
    [66, 31],
    [77, 32],
    [91, 31],
    [6, 41],
    [14, 39],
    [30, 40],
    [41, 41],
    [52, 37],
    [66, 41],
    [78, 38],
    [90, 40],
    [8, 53],
    [19, 49],
    [30, 50],
    [42, 49],
    [54, 49],
    [65, 50],
    [90, 50],
    [6, 58],
    [18, 58],
    [29, 59],
    [43, 58],
    [54, 59],
    [66, 58],
    [78, 58],
    [89, 59],
  ] as const
).map(([x, y]) => ({ x, y }));

export const SCRAPS_PER_DAY = 6;
/** Bonus for finding every scrap of the day. */
export const SCRAP_SET_BONUS = 25;

/** Indices into SCRAP_SPOTS that sparkle today. */
export function scrapSpotsFor(farmId: number, day: number): number[] {
  const rng = rngFor('scrap-spots', farmId, day);
  const pool = SCRAP_SPOTS.map((_, i) => i);
  const out: number[] = [];
  while (out.length < SCRAPS_PER_DAY && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  }
  return out;
}

export type ScrapFind = { coins: number } | { itemId: string; qty: number };

/** What is hiding at a spot today. */
export function scrapFind(farmId: number, day: number, spot: number): ScrapFind {
  const rng = rngFor('scrap-find', farmId, day, spot);
  const r = rng();
  if (r < 0.6) return { coins: 8 + Math.floor(rng() * 13) };
  if (r < 0.75) return { itemId: 'thermal_paste', qty: 1 };
  if (r < 0.85) return { itemId: 'cookie', qty: 2 };
  if (r < 0.95) return { itemId: 'coffee', qty: 1 };
  if (r < 0.98) return { itemId: 'lucky_charm', qty: 1 };
  return { itemId: 'vintage_gpu', qty: 1 };
}
