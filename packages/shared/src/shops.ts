/** Shops and opening hours (MASTERPLAN §6, §11). */
import { ITEMS, rarityRank, type Item } from './items.js';
import { friendshipLevel, type NpcId, type ShopId } from './npcs.js';
import { maxShopRarityForStage } from './world.js';

export interface ShopDef {
  id: ShopId;
  name: string;
  owner?: NpcId;
  /** Opening minute (since midnight). */
  open: number;
  /** Closing minute. */
  close: number;
  /** Weekday index (0 = Mon) the shop is closed, if any. */
  closedOn?: number;
  greeting: string;
}

export const SHOPS: Record<ShopId, ShopDef> = {
  hardware: {
    id: 'hardware',
    name: 'Hardware Store',
    owner: 'mia',
    open: 8 * 60,
    close: 18 * 60,
    closedOn: 6,
    greeting: 'Parts, frames and cooling. Touch it, you bought it.',
  },
  cafe: {
    id: 'cafe',
    name: "Miner's Café",
    owner: 'bo',
    open: 7 * 60,
    close: 22 * 60,
    greeting: 'Fuel for farmers. Energy guaranteed, or your Coins back. (Not really.)',
  },
  repair: {
    id: 'repair',
    name: 'Repair Shop',
    owner: 'dex',
    open: 9 * 60,
    close: 18 * 60,
    closedOn: 2,
    greeting: 'Broken rig? Bring it in. Well, tell me which one, I will walk over.',
  },
  substation: {
    id: 'substation',
    name: 'Power Substation',
    owner: 'vera',
    open: 8 * 60,
    close: 18 * 60,
    closedOn: 5,
    greeting: 'More Power? Sign here, here and here.',
  },
  market: {
    id: 'market',
    name: 'Market Board',
    open: 0,
    close: 48 * 60,
    greeting: 'Prices change every day. Buy low, sell high, nap often.',
  },
};

/** Folks without a shop (Kai) are out and about during these hours. */
export const TOWNFOLK_HOURS = { open: 8 * 60, close: 20 * 60 } as const;

export function isShopOpen(shop: ShopDef, minute: number, weekdayIndex: number): boolean {
  if (shop.closedOn === weekdayIndex) return false;
  // Minutes past midnight (e.g. 1:00 AM = 1500) count as the same day for opening hours.
  return minute >= shop.open && minute < shop.close;
}

export function shopHoursText(shop: ShopDef): string {
  if (shop.id === 'market') return 'Always open';
  const fmt = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const days = [
    'Mondays',
    'Tuesdays',
    'Wednesdays',
    'Thursdays',
    'Fridays',
    'Saturdays',
    'Sundays',
  ];
  const closed = shop.closedOn !== undefined ? ` · Closed ${days[shop.closedOn]}` : '';
  return `${fmt(shop.open)} – ${fmt(shop.close)}${closed}`;
}

export interface ShopContext {
  stage: number;
  friendship: Partial<Record<NpcId, number>>;
}

const HARDWARE_MISC = [
  'thermal_paste',
  'cloth',
  'screwdriver',
  'decor_lamp',
  'decor_fern',
  'decor_gnome',
  'paint_magenta',
  'paint_mint',
  'paint_gold',
  'paint_steel',
  'hat_cap',
  'hat_beanie',
  'hat_headset',
  'hat_straw',
  'flowers',
  'vintage_gpu',
  'lucky_charm',
];

/** Items a shop sells for the given player context. */
export function shopStock(shopId: ShopId, ctx: ShopContext): Item[] {
  const dexLevel = friendshipLevel(ctx.friendship.dex ?? 0);
  const coolingUnitStage = (lvl: number, stage: number) =>
    ctx.stage >= stage || (lvl === 2 && dexLevel >= 3) || (lvl === 3 && dexLevel >= 4);
  switch (shopId) {
    case 'hardware': {
      const maxR = rarityRank(maxShopRarityForStage(ctx.stage));
      const parts = ITEMS.filter(
        (i) =>
          (i.type === 'cpu' || i.type === 'cooler' || i.type === 'psu' || i.type === 'frame') &&
          rarityRank(i.rarity!) <= maxR,
      );
      const units = ITEMS.filter(
        (i) => i.type === 'cooling_unit' && coolingUnitStage(i.level, i.stage),
      );
      const misc = HARDWARE_MISC.map((id) => ITEMS.find((i) => i.id === id)!);
      const catBed = ctx.stage >= 3 ? ITEMS.filter((i) => i.id === 'cat_bed') : [];
      return [...parts, ...units, ...misc, ...catBed];
    }
    case 'cafe':
      return ITEMS.filter((i) => i.type === 'food' || i.id === 'cookie' || i.id === 'hot_sauce');
    case 'repair':
      return ITEMS.filter(
        (i) =>
          i.id === 'screwdriver' ||
          i.id === 'thermal_paste' ||
          i.id === 'solder_kit' ||
          (i.type === 'cooling_unit' && coolingUnitStage(i.level, i.stage)),
      );
    case 'substation':
      return ITEMS.filter((i) => i.id === 'battery_pack');
    case 'market':
      return [];
  }
}

/** Shop price multiplier from friendship perks. */
export function shopDiscount(shopId: ShopId, ctx: ShopContext): number {
  if (shopId === 'hardware') {
    const lvl = friendshipLevel(ctx.friendship.mia ?? 0);
    return lvl >= 4 ? 0.85 : lvl >= 2 ? 0.9 : 1;
  }
  if (shopId === 'cafe') {
    return friendshipLevel(ctx.friendship.bo ?? 0) >= 3 ? 0.8 : 1;
  }
  return 1;
}

export function shopPrice(item: Item, shopId: ShopId, ctx: ShopContext): number {
  return Math.max(1, Math.round(item.price * shopDiscount(shopId, ctx)));
}

export function repairDiscount(ctx: ShopContext): number {
  return friendshipLevel(ctx.friendship.dex ?? 0) >= 2 ? 0.75 : 1;
}

export function powerUpgradeDiscount(ctx: ShopContext): number {
  return friendshipLevel(ctx.friendship.vera ?? 0) >= 2 ? 0.85 : 1;
}

export function powerBillDiscount(ctx: ShopContext): number {
  return friendshipLevel(ctx.friendship.vera ?? 0) >= 4 ? 0.8 : 1;
}
