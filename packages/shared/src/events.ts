/** Seasonal festivals (MASTERPLAN §12). Prizes are items and decorations only — never NVDA. */
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
