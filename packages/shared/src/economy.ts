/**
 * Economy rules (MASTERPLAN §6, §9). Coins are off-chain only.
 * NVDA amounts are bigint token units (string in JSON).
 */
import { getItem, ITEMS, type Item, type ItemType } from './items.js';
import { seeded } from './rng.js';
import type { Season } from './time.js';

// ---------------------------------------------------------------------------
// Energy (MASTERPLAN §6)
// ---------------------------------------------------------------------------
export const MAX_ENERGY = 100;
export const PASS_OUT_ENERGY = 50;
/** Coins fee when the player passes out at 2:00 AM. */
export const PASS_OUT_FEE = 30;

/** Energy after sleeping, given the minute the player went to bed. */
export function energyAfterSleep(bedMinute: number): number {
  if (bedMinute < 24 * 60) return MAX_ENERGY;
  // 12:00–2:00 AM: partial refill, 90 → 60 the later you go to bed.
  const late = Math.min(1, Math.max(0, (bedMinute - 24 * 60) / 120));
  return Math.round(90 - late * 30);
}

// ---------------------------------------------------------------------------
// Bedtime: sleeping skips the night, so it has to be night (or you have to be worn out).
// Without this, sleeping right after waking up would fast-forward rigs without playing.
// ---------------------------------------------------------------------------
/** Normal bedtime: 8:00 PM. */
export const BEDTIME_MINUTE = 20 * 60;
/** Worn out (Energy at or below TIRED_ENERGY): bed from 2:00 PM. */
export const TIRED_BEDTIME_MINUTE = 14 * 60;
export const TIRED_ENERGY = 30;

/** Earliest minute the player may go to bed today. Day 1 (the tutorial night) has no limit. */
export function earliestBedtime(day: number, energy: number): number {
  if (day <= 1) return 0;
  return energy <= TIRED_ENERGY ? TIRED_BEDTIME_MINUTE : BEDTIME_MINUTE;
}

export function canSleep(day: number, minute: number, energy: number): boolean {
  return minute >= earliestBedtime(day, energy);
}

/** English explanation shown when it's too early for bed. */
export function tooEarlyToSleepText(): string {
  return `It's too early for bed. You can sleep from 8:00 PM — or from 2:00 PM if you're worn out (${TIRED_ENERGY} Energy or less).`;
}

// ---------------------------------------------------------------------------
// Power (MASTERPLAN §7)
// ---------------------------------------------------------------------------
export const START_POWER_CAPACITY = 500;
/** Coins per kWh on the weekly bill. */
export const POWER_PRICE_PER_KWH = 2;
/** The weekly bill arrives on Monday mornings (weekday index 0). */
export const POWER_BILL_WEEKDAY = 0;

export interface PowerUpgrade {
  id: string;
  name: string;
  description: string;
  watts: number;
  cost: number;
  stage: number;
  /** Multiplier on the power bill (solar). */
  billMultiplier?: number;
  requires?: string;
}

export const POWER_UPGRADES: readonly PowerUpgrade[] = [
  {
    id: 'wiring_1',
    name: 'Garage Rewiring',
    description: 'Thicker cables. +250 W capacity.',
    watts: 250,
    cost: 400,
    stage: 1,
  },
  {
    id: 'wiring_2',
    name: 'Heavy Duty Panel',
    description: 'A brand-new breaker panel. +400 W capacity.',
    watts: 400,
    cost: 1200,
    stage: 2,
    requires: 'wiring_1',
  },
  {
    id: 'solar',
    name: 'Rooftop Solar',
    description: 'Panels on the warehouse roof. +300 W and 25% smaller power bills.',
    watts: 300,
    cost: 3000,
    stage: 3,
    billMultiplier: 0.75,
  },
  {
    id: 'contract_1',
    name: 'Substation Contract',
    description: 'A direct line from the substation. +800 W capacity.',
    watts: 800,
    cost: 5000,
    stage: 3,
    requires: 'wiring_2',
  },
  {
    id: 'contract_2',
    name: 'Data Center Feed',
    description: 'A dedicated feed up the hill. +1,500 W capacity.',
    watts: 1500,
    cost: 12000,
    stage: 4,
    requires: 'contract_1',
  },
];

export function powerCapacity(upgrades: readonly string[]): number {
  return (
    START_POWER_CAPACITY +
    POWER_UPGRADES.filter((u) => upgrades.includes(u.id)).reduce((s, u) => s + u.watts, 0)
  );
}

export function billMultiplier(upgrades: readonly string[]): number {
  return POWER_UPGRADES.filter((u) => upgrades.includes(u.id)).reduce(
    (m, u) => m * (u.billMultiplier ?? 1),
    1,
  );
}

/** kWh used by a constant draw over game minutes. */
export function kwh(watts: number, minutes: number): number {
  return (watts * minutes) / 60 / 1000;
}

// ---------------------------------------------------------------------------
// Rewards (MASTERPLAN §9)
// ---------------------------------------------------------------------------
export interface RewardConfig {
  /** USD per harvest at the normal rate. */
  normalUsdPerHarvest: number;
  /** USD per harvest during the beginner boost. */
  boostUsdPerHarvest: number;
  /** Number of harvests that get the beginner boost. */
  boostHarvestCount: number;
  /** Minimum USD value to unlock Withdraw. */
  withdrawMinUsd: number;
  /**
   * Harvests per farm per UTC day that pay NVDA (0 = no limit). Later harvests still pay
   * Coins. Keeps the reward budget safe from scripted farms.
   */
  dailyNvdaHarvests: number;
  /** A farm must be this many hours old before its first withdrawal (0 = no wait). */
  withdrawMinFarmAgeHours: number;
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  normalUsdPerHarvest: 0.02,
  boostUsdPerHarvest: 0.08,
  boostHarvestCount: 60,
  withdrawMinUsd: 5,
  dailyNvdaHarvests: 24,
  withdrawMinFarmAgeHours: 72,
};

/** UTC calendar day ("2026-10-15") that the daily NVDA harvest limit counts against. */
export function rewardDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** When the daily NVDA harvest limit resets: the next UTC midnight after `ms`. */
export function rewardDayResetsAt(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function usdForHarvest(
  cfg: RewardConfig,
  harvestNumber: number,
): { usd: number; boosted: boolean } {
  const boosted = harvestNumber <= cfg.boostHarvestCount;
  return { usd: boosted ? cfg.boostUsdPerHarvest : cfg.normalUsdPerHarvest, boosted };
}

/** 1e6 fixed point for USD and prices. */
export const MICRO = 1_000_000n;

export function toMicros(x: number): bigint {
  return BigInt(Math.round(x * 1_000_000));
}

/** Convert USD to token units at a USD price per whole token. */
export function usdToTokenUnits(usd: number, priceUsd: number, decimals: number): bigint {
  const usdM = toMicros(usd);
  const priceM = toMicros(priceUsd);
  if (priceM <= 0n) throw new Error('Invalid price');
  return (usdM * 10n ** BigInt(decimals)) / priceM;
}

/** USD value of token units. */
export function tokenUnitsToUsd(units: bigint, priceUsd: number, decimals: number): number {
  const priceM = toMicros(priceUsd);
  const usdM = (units * priceM) / 10n ** BigInt(decimals);
  return Number(usdM) / 1_000_000;
}

/** Human readable token amount, e.g. "0.0312". */
export function formatTokenUnits(
  units: bigint | string,
  decimals: number,
  maxFraction = 4,
): string {
  const u = typeof units === 'string' ? BigInt(units) : units;
  const neg = u < 0n;
  const abs = neg ? -u : u;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  if (!fracStr && frac > 0n) fracStr = '0'.repeat(maxFraction - 1) + '1'; // never show a tiny balance as 0
  const wholeStr = whole.toLocaleString('en-US');
  return `${neg ? '-' : ''}${wholeStr}${fracStr ? '.' + fracStr : ''}`;
}

// ---------------------------------------------------------------------------
// Market Board (MASTERPLAN §9)
// ---------------------------------------------------------------------------
export type MarketCategory =
  'cpu' | 'cooler' | 'psu' | 'frame' | 'cooling_unit' | 'consumable' | 'gift';
export const MARKET_CATEGORIES: readonly MarketCategory[] = [
  'cpu',
  'cooler',
  'psu',
  'frame',
  'cooling_unit',
  'consumable',
  'gift',
];

export type SeasonalModifiers = Record<Season, Record<MarketCategory, number>>;

export const DEFAULT_SEASONAL_MODIFIERS: SeasonalModifiers = {
  // Everyone expands in spring: parts are pricier.
  spring: {
    cpu: 1.15,
    cooler: 1.05,
    psu: 1.1,
    frame: 1.15,
    cooling_unit: 1.0,
    consumable: 1.0,
    gift: 1.1,
  },
  // Heatwaves: cooling is in demand.
  summer: {
    cpu: 1.0,
    cooler: 1.3,
    psu: 1.0,
    frame: 1.0,
    cooling_unit: 1.3,
    consumable: 1.15,
    gift: 1.0,
  },
  // Fall: good sell prices everywhere.
  fall: {
    cpu: 1.2,
    cooler: 1.15,
    psu: 1.15,
    frame: 1.2,
    cooling_unit: 1.15,
    consumable: 1.1,
    gift: 1.0,
  },
  // Winter: rigs run cool, nobody wants coolers.
  winter: {
    cpu: 1.0,
    cooler: 0.8,
    psu: 1.05,
    frame: 0.95,
    cooling_unit: 0.8,
    consumable: 0.95,
    gift: 1.25,
  },
};

export interface MarketConfig {
  /** Overrides of base prices per item id. */
  basePrices: Record<string, number>;
  seasonalModifiers: SeasonalModifiers;
  /** Daily price swing, e.g. 0.15 = ±15%. */
  dailySwing: number;
  /** Market Board pays this share of the buy price when the player sells. */
  sellRatio: number;
}

export const DEFAULT_MARKET_CONFIG: MarketConfig = {
  basePrices: {},
  seasonalModifiers: DEFAULT_SEASONAL_MODIFIERS,
  dailySwing: 0.15,
  sellRatio: 0.55,
};

export function marketCategory(item: Item): MarketCategory | undefined {
  const t: ItemType = item.type;
  return (MARKET_CATEGORIES as readonly string[]).includes(t) ? (t as MarketCategory) : undefined;
}

export function marketItems(): Item[] {
  return ITEMS.filter((i) => i.sellable && marketCategory(i));
}

export interface MarketQuote {
  itemId: string;
  buy: number;
  sell: number;
  /** Percent vs base price, e.g. +12. */
  trend: number;
}

export function marketQuote(
  cfg: MarketConfig,
  itemId: string,
  day: number,
  season: Season,
): MarketQuote | undefined {
  const item = getItem(itemId);
  if (!item) return undefined;
  const cat = marketCategory(item);
  if (!cat || !item.sellable) return undefined;
  const base = cfg.basePrices[itemId] ?? item.price;
  const seasonal = cfg.seasonalModifiers[season]?.[cat] ?? 1;
  const noise = 1 + (seeded('market', day, itemId) * 2 - 1) * cfg.dailySwing;
  const mult = seasonal * noise;
  const buy = Math.max(1, Math.round(base * mult));
  const sell = Math.max(1, Math.round(base * mult * cfg.sellRatio));
  return { itemId, buy, sell, trend: Math.round((mult - 1) * 100) };
}

// ---------------------------------------------------------------------------
// Misc constants
// ---------------------------------------------------------------------------
export const STARTING_COINS = 300;
export const SHOP_REPAIR_BASE = 60;
