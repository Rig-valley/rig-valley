/**
 * Item catalog. Prices are in Coins and are a first balancing pass
 * (MASTERPLAN §16: tuned after playtests). Market Board base prices can be
 * overridden from the admin panel.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_NAMES: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
};

export function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}

export type ItemType =
  | 'cpu'
  | 'cooler'
  | 'psu'
  | 'frame'
  | 'cooling_unit'
  | 'consumable'
  | 'tool'
  | 'food'
  | 'gift'
  | 'decor'
  | 'paint'
  | 'outfit'
  | 'key';

interface BaseItem {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  /** Hardware Store / shop price in Coins. 0 = not sold in shops. */
  price: number;
  rarity?: Rarity;
  /** Can be sold on the Market Board. */
  sellable: boolean;
  /** Icon index in the item icon atlas. */
  icon: number;
}

export interface CpuItem extends BaseItem {
  type: 'cpu';
  rarity: Rarity;
  /** Heat added to rig temperature (°C). */
  heat: number;
  /** Power draw in watts before PSU efficiency. */
  watts: number;
  /** Harvest cycle length in in-game days (MASTERPLAN §7). */
  cycleDays: number;
  /** Coins paid per harvest. */
  coins: number;
}

export interface CoolerItem extends BaseItem {
  type: 'cooler';
  rarity: Rarity;
  cooling: number;
  watts: number;
}

export interface PsuItem extends BaseItem {
  type: 'psu';
  rarity: Rarity;
  /** Multiplier on CPU watts. Lower = more efficient. */
  efficiency: number;
}

export interface FrameItem extends BaseItem {
  type: 'frame';
  rarity: Rarity;
  /** Rig tier 1..4. Caps the rarity of installable parts. */
  tier: 1 | 2 | 3 | 4;
  maxRarity: Rarity;
  /** Passive cooling from the casing. */
  cooling: number;
  /** Multiplier on harvest Coins. */
  coinBonus: number;
}

export interface CoolingUnitItem extends BaseItem {
  type: 'cooling_unit';
  level: 1 | 2 | 3;
  /** Radius in slots. 1 = 3×3, 2 = 5×5, 3 = 7×7. */
  radius: number;
  cooling: number;
  watts: number;
  /** Progression stage required to buy it from the Hardware Store. */
  stage: number;
}

export interface FoodItem extends BaseItem {
  type: 'food';
  energy: number;
}

export interface GenericItem extends BaseItem {
  type: 'consumable' | 'tool' | 'gift' | 'decor' | 'paint' | 'outfit' | 'key';
  /** For paint: rig casing color. For outfit: hat id. */
  value?: string;
  /** Not sold in shops (event prize, quest reward…). */
  special?: boolean;
}

export type Item =
  CpuItem | CoolerItem | PsuItem | FrameItem | CoolingUnitItem | FoodItem | GenericItem;

const cpus: CpuItem[] = [
  {
    id: 'cpu_common',
    name: 'Pebble CPU',
    type: 'cpu',
    rarity: 'common',
    heat: 30,
    watts: 60,
    cycleDays: 2,
    coins: 45,
    price: 100,
    sellable: true,
    icon: 4,
    description: 'Small, humble, reliable. Harvests every 2 days.',
  },
  {
    id: 'cpu_uncommon',
    name: 'Sprout CPU',
    type: 'cpu',
    rarity: 'uncommon',
    heat: 36,
    watts: 75,
    cycleDays: 1.5,
    coins: 57,
    price: 420,
    sellable: true,
    icon: 4,
    description: 'A little faster, a little warmer. Harvests every 1.5 days.',
  },
  {
    id: 'cpu_rare',
    name: 'Comet CPU',
    type: 'cpu',
    rarity: 'rare',
    heat: 44,
    watts: 95,
    cycleDays: 1,
    coins: 72,
    price: 1400,
    sellable: true,
    icon: 4,
    description: 'Zooms through a cycle every day. Keep it cool.',
  },
  {
    id: 'cpu_epic',
    name: 'Supernova CPU',
    type: 'cpu',
    rarity: 'epic',
    heat: 54,
    watts: 120,
    cycleDays: 0.5,
    coins: 90,
    price: 4800,
    sellable: true,
    icon: 4,
    description: 'Twice a day. Runs hot enough to fry an egg.',
  },
];

const coolers: CoolerItem[] = [
  {
    id: 'cooler_common',
    name: 'Breeze Fan',
    type: 'cooler',
    rarity: 'common',
    cooling: 14,
    watts: 6,
    price: 90,
    sellable: true,
    icon: 1,
    description: 'A friendly fan. Better than the stock one.',
  },
  {
    id: 'cooler_uncommon',
    name: 'Twin Breeze',
    type: 'cooler',
    rarity: 'uncommon',
    cooling: 20,
    watts: 8,
    price: 300,
    sellable: true,
    icon: 1,
    description: 'Two fans, twice the breeze.',
  },
  {
    id: 'cooler_rare',
    name: 'Frostbite Tower',
    type: 'cooler',
    rarity: 'rare',
    cooling: 28,
    watts: 10,
    price: 950,
    sellable: true,
    icon: 1,
    description: 'A tall tower of chilly metal fins.',
  },
  {
    id: 'cooler_epic',
    name: 'Glacier Loop',
    type: 'cooler',
    rarity: 'epic',
    cooling: 38,
    watts: 14,
    price: 3200,
    sellable: true,
    icon: 1,
    description: 'Liquid cooling. Glows a calm blue.',
  },
];

const psus: PsuItem[] = [
  {
    id: 'psu_common',
    name: 'Brick PSU',
    type: 'psu',
    rarity: 'common',
    efficiency: 1.15,
    price: 80,
    sellable: true,
    icon: 2,
    description: 'Heavy and loud, but it saves a bit of Power.',
  },
  {
    id: 'psu_uncommon',
    name: 'Steady PSU',
    type: 'psu',
    rarity: 'uncommon',
    efficiency: 1.08,
    price: 260,
    sellable: true,
    icon: 2,
    description: 'Steady Power, smaller bills.',
  },
  {
    id: 'psu_rare',
    name: 'Gold PSU',
    type: 'psu',
    rarity: 'rare',
    efficiency: 1.0,
    price: 850,
    sellable: true,
    icon: 2,
    description: 'Wastes almost nothing.',
  },
  {
    id: 'psu_epic',
    name: 'Platinum PSU',
    type: 'psu',
    rarity: 'epic',
    efficiency: 0.92,
    price: 3000,
    sellable: true,
    icon: 2,
    description: 'So efficient it feels like cheating.',
  },
];

const frames: FrameItem[] = [
  {
    id: 'frame_t1',
    name: 'Scrap Frame',
    type: 'frame',
    rarity: 'common',
    tier: 1,
    maxRarity: 'common',
    cooling: 0,
    coinBonus: 1,
    price: 120,
    sellable: true,
    icon: 8,
    description: 'Tier 1 rig casing. Fits Common parts.',
  },
  {
    id: 'frame_t2',
    name: 'Steel Frame',
    type: 'frame',
    rarity: 'uncommon',
    tier: 2,
    maxRarity: 'uncommon',
    cooling: 2,
    coinBonus: 1.1,
    price: 650,
    sellable: true,
    icon: 8,
    description: 'Tier 2 rig casing. Fits up to Uncommon parts.',
  },
  {
    id: 'frame_t3',
    name: 'Carbon Frame',
    type: 'frame',
    rarity: 'rare',
    tier: 3,
    maxRarity: 'rare',
    cooling: 4,
    coinBonus: 1.2,
    price: 2200,
    sellable: true,
    icon: 8,
    description: 'Tier 3 rig casing. Fits up to Rare parts.',
  },
  {
    id: 'frame_t4',
    name: 'Titan Frame',
    type: 'frame',
    rarity: 'epic',
    tier: 4,
    maxRarity: 'epic',
    cooling: 6,
    coinBonus: 1.3,
    price: 6500,
    sellable: true,
    icon: 8,
    description: 'Tier 4 rig casing. Fits anything, even Epic parts.',
  },
];

const coolingUnits: CoolingUnitItem[] = [
  {
    id: 'cooling_lv1',
    name: 'Cooling Unit Lv1',
    type: 'cooling_unit',
    level: 1,
    radius: 1,
    cooling: 6,
    watts: 15,
    stage: 1,
    price: 200,
    sellable: true,
    icon: 9,
    description: 'Cools every rig around it (3×3 area).',
  },
  {
    id: 'cooling_lv2',
    name: 'Cooling Unit Lv2',
    type: 'cooling_unit',
    level: 2,
    radius: 2,
    cooling: 9,
    watts: 25,
    stage: 2,
    price: 700,
    sellable: true,
    icon: 9,
    description: 'Cools a bigger area (5×5).',
  },
  {
    id: 'cooling_lv3',
    name: 'Cooling Unit Lv3',
    type: 'cooling_unit',
    level: 3,
    radius: 3,
    cooling: 12,
    watts: 35,
    stage: 3,
    price: 1900,
    sellable: true,
    icon: 9,
    description: 'Cools a huge area (7×7).',
  },
];

const misc: Item[] = [
  {
    id: 'thermal_paste',
    name: 'Thermal Paste',
    type: 'consumable',
    price: 15,
    sellable: true,
    icon: 5,
    description: 'Fresh paste helps a rig shed heat. Used up on Repaste.',
  },
  {
    id: 'cloth',
    name: 'Cleaning Cloth',
    type: 'tool',
    price: 20,
    sellable: false,
    icon: 3,
    description: 'Wipes dust off rigs. Never wears out.',
  },
  {
    id: 'screwdriver',
    name: 'Screwdriver',
    type: 'tool',
    price: 50,
    sellable: false,
    icon: 0,
    description: 'Fix up a rig yourself. Never wears out.',
  },
  {
    id: 'cat_bed',
    name: 'Heated Cat Bed',
    type: 'key',
    price: 900,
    sellable: false,
    icon: 10,
    description: "A cozy bed warmer than any rig. Uncle Ray's cats might finally move.",
  },
  {
    id: 'surge_shield',
    name: 'Surge Shield',
    type: 'key',
    price: 0,
    special: true,
    sellable: false,
    icon: 11,
    description: 'Vera rigged it herself. Storms can no longer knock out your rigs.',
  },

  // Café
  {
    id: 'coffee',
    name: 'Coffee',
    type: 'food',
    energy: 20,
    price: 15,
    sellable: false,
    icon: 12,
    description: 'Restores 20 Energy.',
  },
  {
    id: 'sandwich',
    name: 'Byte Sandwich',
    type: 'food',
    energy: 35,
    price: 30,
    sellable: false,
    icon: 13,
    description: 'Restores 35 Energy.',
  },
  {
    id: 'energy_drink',
    name: 'Overclock Soda',
    type: 'food',
    energy: 50,
    price: 60,
    sellable: false,
    icon: 14,
    description: 'Restores 50 Energy. Tastes like batteries.',
  },

  // Gifts
  {
    id: 'cookie',
    name: 'Chip Cookie',
    type: 'gift',
    price: 8,
    sellable: false,
    icon: 15,
    description: 'A cookie shaped like a microchip.',
  },
  {
    id: 'flowers',
    name: 'Neon Flowers',
    type: 'gift',
    price: 20,
    sellable: false,
    icon: 16,
    description: 'They glow a little at night.',
  },
  {
    id: 'hot_sauce',
    name: 'Thermal Hot Sauce',
    type: 'gift',
    price: 25,
    sellable: false,
    icon: 17,
    description: 'Rated 95 °C on the spice scale.',
  },
  {
    id: 'solder_kit',
    name: 'Solder Kit',
    type: 'gift',
    price: 45,
    sellable: false,
    icon: 18,
    description: 'For people who like fixing things.',
  },
  {
    id: 'battery_pack',
    name: 'Battery Pack',
    type: 'gift',
    price: 40,
    sellable: false,
    icon: 19,
    description: 'A boxed battery with a bow on top. Anyone who loves Power will love this gift.',
  },
  {
    id: 'lucky_charm',
    name: 'Lucky Cat Charm',
    type: 'gift',
    price: 60,
    sellable: false,
    icon: 20,
    description: 'Waves its paw. Supposedly brings luck.',
  },
  {
    id: 'vintage_gpu',
    name: 'Vintage GPU',
    type: 'gift',
    price: 120,
    sellable: false,
    icon: 21,
    description: 'A collector piece. Do not plug it in.',
  },

  // Decorations
  {
    id: 'decor_lamp',
    name: 'Neon Lamp',
    type: 'decor',
    price: 80,
    sellable: false,
    icon: 22,
    description: 'Place it on a free field slot. Pure vibes.',
  },
  {
    id: 'decor_fern',
    name: 'Potted Fern',
    type: 'decor',
    price: 40,
    sellable: false,
    icon: 23,
    description: 'A little green between the rigs.',
  },
  {
    id: 'decor_gnome',
    name: 'Gnome Bot',
    type: 'decor',
    price: 150,
    sellable: false,
    icon: 24,
    description: 'A garden gnome with a blinking LED.',
  },
  {
    id: 'decor_ribbon',
    name: 'Spring Ribbon',
    type: 'decor',
    price: 0,
    special: true,
    sellable: false,
    icon: 25,
    description: 'Spring Fair prize. Tidiest field in the valley!',
  },
  {
    id: 'decor_fountain',
    name: 'Cool Fountain',
    type: 'decor',
    price: 0,
    special: true,
    sellable: false,
    icon: 26,
    description: 'Cool Down Festival prize.',
  },
  {
    id: 'decor_lantern',
    name: 'Harvest Lantern',
    type: 'decor',
    price: 0,
    special: true,
    sellable: false,
    icon: 27,
    description: 'Harvest Night prize. Warm and orange.',
  },
  {
    id: 'decor_glowtree',
    name: 'Winter Glow Tree',
    type: 'decor',
    price: 0,
    special: true,
    sellable: false,
    icon: 28,
    description: 'Winter Glow prize. Covered in neon lights.',
  },
  {
    id: 'decor_trophy',
    name: 'Speed Trophy',
    type: 'decor',
    price: 0,
    special: true,
    sellable: false,
    icon: 29,
    description: 'A shiny trophy. Proof you are one of the best in the valley.',
  },

  // Rig paint
  {
    id: 'paint_magenta',
    name: 'Magenta Rig Paint',
    type: 'paint',
    value: 'magenta',
    price: 120,
    sellable: false,
    icon: 30,
    description: 'Paints a rig casing magenta.',
  },
  {
    id: 'paint_mint',
    name: 'Mint Rig Paint',
    type: 'paint',
    value: 'mint',
    price: 120,
    sellable: false,
    icon: 30,
    description: 'Paints a rig casing mint green.',
  },
  {
    id: 'paint_gold',
    name: 'Gold Rig Paint',
    type: 'paint',
    value: 'gold',
    price: 400,
    sellable: false,
    icon: 30,
    description: 'Paints a rig casing gold. Very fancy.',
  },
  {
    id: 'paint_steel',
    name: 'Steel Rig Paint',
    type: 'paint',
    value: 'steel',
    price: 60,
    sellable: false,
    icon: 30,
    description: 'Back to the classic look.',
  },

  // Outfits (hats)
  {
    id: 'hat_cap',
    name: 'Rig Cap',
    type: 'outfit',
    value: 'cap',
    price: 60,
    sellable: false,
    icon: 31,
    description: 'A cap with a tiny fan on top.',
  },
  {
    id: 'hat_beanie',
    name: 'Cozy Beanie',
    type: 'outfit',
    value: 'beanie',
    price: 60,
    sellable: false,
    icon: 31,
    description: 'Warm. Very warm.',
  },
  {
    id: 'hat_headset',
    name: 'Headset',
    type: 'outfit',
    value: 'headset',
    price: 90,
    sellable: false,
    icon: 31,
    description: 'For listening to the rigs hum.',
  },
  {
    id: 'hat_straw',
    name: 'Straw Hat',
    type: 'outfit',
    value: 'straw',
    price: 50,
    sellable: false,
    icon: 31,
    description: 'Classic farmer style.',
  },
  {
    id: 'hat_crown',
    name: 'Glow Crown',
    type: 'outfit',
    value: 'crown',
    price: 0,
    special: true,
    sellable: false,
    icon: 31,
    description: 'Winter Glow gift swap prize.',
  },
];

export const ITEMS: readonly Item[] = [
  ...cpus,
  ...coolers,
  ...psus,
  ...frames,
  ...coolingUnits,
  ...misc,
];

const byId = new Map<string, Item>(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): Item | undefined {
  return byId.get(id);
}

export function requireItem(id: string): Item {
  const item = byId.get(id);
  if (!item) throw new Error(`Unknown item: ${id}`);
  return item;
}

export function isCpu(i: Item | undefined): i is CpuItem {
  return i?.type === 'cpu';
}
export function isCooler(i: Item | undefined): i is CoolerItem {
  return i?.type === 'cooler';
}
export function isPsu(i: Item | undefined): i is PsuItem {
  return i?.type === 'psu';
}
export function isFrame(i: Item | undefined): i is FrameItem {
  return i?.type === 'frame';
}
export function isCoolingUnit(i: Item | undefined): i is CoolingUnitItem {
  return i?.type === 'cooling_unit';
}
export function isFood(i: Item | undefined): i is FoodItem {
  return i?.type === 'food';
}

/** Stock parts used when a rig slot is empty. */
export const STOCK_COOLER = { name: 'Stock fan', cooling: 8, watts: 5 } as const;
export const STOCK_PSU = { name: 'Stock PSU', efficiency: 1.25 } as const;

export const HAIR_COLORS = [
  { id: 'ink', name: 'Ink', color: '#2a2b63' },
  { id: 'chestnut', name: 'Chestnut', color: '#94504a' },
  { id: 'copper', name: 'Copper', color: '#cf8556' },
  { id: 'honey', name: 'Honey', color: '#ffd685' },
  { id: 'mint', name: 'Mint', color: '#5cffab' },
  { id: 'magenta', name: 'Magenta', color: '#ff52dc' },
] as const;
export type HairColorId = (typeof HAIR_COLORS)[number]['id'];

export const HATS = [
  { id: 'none', name: 'No hat' },
  { id: 'cap', name: 'Rig Cap' },
  { id: 'beanie', name: 'Cozy Beanie' },
  { id: 'headset', name: 'Headset' },
  { id: 'straw', name: 'Straw Hat' },
  { id: 'crown', name: 'Glow Crown' },
] as const;
export type HatId = (typeof HATS)[number]['id'];
/** Hats a new player can pick during character creation. */
export const STARTER_HATS: HatId[] = ['none', 'cap', 'beanie', 'straw'];

export const RIG_PAINTS = ['steel', 'magenta', 'mint', 'gold'] as const;
export type RigPaint = (typeof RIG_PAINTS)[number];
