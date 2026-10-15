/** Seasonal festivals (MASTERPLAN §12). Prizes are items and decorations only — never NVDA. */
import { mulberry32 } from './rng.js';
import type { Season } from './time.js';

export type FestivalId = 'spring_fair' | 'cooldown_festival' | 'harvest_night' | 'winter_glow';

export interface FestivalDef {
  id: FestivalId;
  season: Season;
  name: string;
  description: string;
  /** Day of the season (1..28). */
  dayOfSeason: number;
  prize: string;
  consolation: { itemId: string; qty: number };
}

export const FESTIVAL_DAY = 14;

export const FESTIVALS: Record<Season, FestivalDef> = {
  spring: {
    id: 'spring_fair',
    season: 'spring',
    name: 'Spring Fair',
    description:
      'The tidiest rig field in the valley wins a Spring Ribbon. Have at least 2 rigs running, keep the dust down and the Health up!',
    dayOfSeason: FESTIVAL_DAY,
    prize: 'decor_ribbon',
    consolation: { itemId: 'cookie', qty: 3 },
  },
  summer: {
    id: 'cooldown_festival',
    season: 'summer',
    name: 'Cool Down Festival',
    description:
      'The coolest-running rigs win the Cool Fountain. Have at least 2 rigs running and keep them under 60°C!',
    dayOfSeason: FESTIVAL_DAY,
    prize: 'decor_fountain',
    consolation: { itemId: 'coffee', qty: 2 },
  },
  fall: {
    id: 'harvest_night',
    season: 'fall',
    name: 'Harvest Night',
    description:
      'The night market is open! The Market Board pays 20% more today, and every visitor gets a lantern.',
    dayOfSeason: FESTIVAL_DAY,
    prize: 'decor_lantern',
    consolation: { itemId: 'cookie', qty: 2 },
  },
  winter: {
    id: 'winter_glow',
    season: 'winter',
    name: 'Winter Glow',
    description: 'Neon lights everywhere and a gift swap. Bring any gift and get a surprise back!',
    dayOfSeason: FESTIVAL_DAY,
    prize: 'decor_glowtree',
    consolation: { itemId: 'flowers', qty: 1 },
  },
};

export function festivalToday(season: Season, dayOfSeason: number): FestivalDef | undefined {
  const f = FESTIVALS[season];
  return f.dayOfSeason === dayOfSeason ? f : undefined;
}

/** Fall festival market bonus. */
export const HARVEST_NIGHT_SELL_BONUS = 1.2;

/** Kai's total Speed (harvests/day) for speed races. Grows slowly over time. */
export function kaiSpeed(day: number): number {
  return 2 + Math.floor(day / 28) * 1.5;
}

export interface Minigame {
  id: 'coffee_rush';
  name: string;
  energy: number;
  maxScore: number;
  coinsPerPoint: number;
  /** Bo's tip per order made without a single mistake. */
  tipPerPerfect: number;
}

export const MINIGAMES: Record<'coffee_rush', Minigame> = {
  coffee_rush: {
    id: 'coffee_rush',
    name: 'Coffee Rush',
    energy: 5,
    maxScore: 10,
    coinsPerPoint: 4,
    tipPerPerfect: 2,
  },
};

// ---------------------------------------------------------------------------
// Coffee Rush rules, shared so the server can replay a shift and pay for what was played.
// ---------------------------------------------------------------------------
/** Shift length, from "Go!". */
export const COFFEE_RUSH_SHIFT_MS = 30_000;
/** The 3-2-1 countdown before "Go!". */
export const COFFEE_RUSH_COUNTDOWN_MS = 1_800;
/** A started shift can be handed in for this long (real time); after that it's forfeited. */
export const COFFEE_RUSH_PAY_WINDOW_MS = 10 * 60_000;
/** Most key presses a shift can send. */
export const COFFEE_RUSH_MAX_KEYS = 400;
/** Key codes in a shift log: 0 = up, 1 = down, 2 = left, 3 = right. */
export type RushKey = 0 | 1 | 2 | 3;
/** One key press: [key, ms since "Go!"]. */
export type RushPress = [RushKey, number];

/** The drink orders for a shift: arrow sequences that get longer as the shift goes on. */
export function coffeeRushOrders(seed: number): RushKey[][] {
  const rand = mulberry32(seed);
  const max = MINIGAMES.coffee_rush.maxScore;
  return Array.from({ length: max }, (_, i) => {
    const round = i + 1;
    const len = 3 + Math.min(3, Math.floor(round / 3));
    return Array.from({ length: len }, () => Math.floor(rand() * 4) as RushKey);
  });
}

/**
 * Replay a shift: a wrong key restarts the current drink and costs its tip.
 * Presses after the shift ended (or after the last order) don't count.
 */
export function playCoffeeRush(
  seed: number,
  presses: readonly RushPress[],
): { score: number; perfect: number } {
  const orders = coffeeRushOrders(seed);
  let score = 0;
  let perfect = 0;
  let pos = 0;
  let slipped = false;
  for (const [key, t] of presses) {
    if (score >= orders.length || t > COFFEE_RUSH_SHIFT_MS) break;
    const seq = orders[score]!;
    if (key === seq[pos]) {
      pos++;
      if (pos === seq.length) {
        score++;
        if (!slipped) perfect++;
        pos = 0;
        slipped = false;
      }
    } else {
      slipped = true;
      pos = 0;
    }
  }
  return { score, perfect };
}
