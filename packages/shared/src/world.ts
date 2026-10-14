/**
 * World layout shared by the map generator (client) and the server.
 * Rig fields are grids of slots. Slot rows are separated by a 1-tile walkway
 * so every slot can be reached from the walkway below it.
 */
export const TILE = 16;
export const WORLD_COLS = 96;
export const WORLD_ROWS = 64;

export type FieldId = 'garage' | 'yard' | 'river' | 'datacenter';

export interface FieldDef {
  id: FieldId;
  name: string;
  /** Progression stage that unlocks this field. */
  stage: 1 | 2 | 3 | 4;
  /** Tile coordinates of the top-left slot. */
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** Extra cooling for every rig in this field (river water cooling). */
  cooling: number;
  /** Service drones keep rigs here maintained overnight. */
  drones: boolean;
}

export const FIELDS: readonly FieldDef[] = [
  {
    id: 'garage',
    name: 'Garage Field',
    stage: 1,
    x: 17,
    y: 31,
    cols: 6,
    rows: 3,
    cooling: 0,
    drones: false,
  },
  {
    id: 'yard',
    name: 'Backyard',
    stage: 2,
    x: 17,
    y: 40,
    cols: 8,
    rows: 3,
    cooling: 0,
    drones: false,
  },
  {
    id: 'river',
    name: 'Warehouse Bay',
    stage: 3,
    x: 47,
    y: 40,
    cols: 7,
    rows: 3,
    cooling: 10,
    drones: false,
  },
  {
    id: 'datacenter',
    name: 'Data Center',
    stage: 4,
    x: 72,
    y: 47,
    cols: 10,
    rows: 3,
    cooling: 4,
    drones: true,
  },
];

export interface SlotRef {
  field: FieldDef;
  col: number;
  row: number;
  x: number;
  y: number;
}

/** Find which field slot sits on a tile, if any. */
export function slotAt(x: number, y: number): SlotRef | undefined {
  for (const field of FIELDS) {
    const col = x - field.x;
    const dy = y - field.y;
    if (col < 0 || col >= field.cols || dy < 0 || dy % 2 !== 0) continue;
    const row = dy / 2;
    if (row >= field.rows) continue;
    return { field, col, row, x, y };
  }
  return undefined;
}

export function allSlots(field: FieldDef): SlotRef[] {
  const out: SlotRef[] = [];
  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      out.push({ field, col, row, x: field.x + col, y: field.y + row * 2 });
    }
  }
  return out;
}

/** Chebyshev distance between two slots in slot-grid units, or Infinity across fields. */
export function slotDistance(a: SlotRef, b: SlotRef): number {
  if (a.field.id !== b.field.id) return Infinity;
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** The tutorial rig sits in the first slot of the garage field. */
export const TUTORIAL_SLOT = { x: 17, y: 31 } as const;

/** Spawn point (tile) in front of the garage. */
export const SPAWN = { x: 9, y: 31 } as const;

export interface StageDef {
  stage: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  /** Max number of rigs the player may own at this stage. */
  maxRigs: number;
  /** Requirements to unlock this stage (stage 1 is the start). */
  cost: number;
  activeRigs: number;
  /** Main quest that must be completed first. */
  quest?: string;
  /** Key item that must be in inventory. */
  keyItem?: string;
  unlocks: string[];
}

export const STAGES: readonly StageDef[] = [
  {
    stage: 1,
    name: 'Inherited Garage',
    description: "Uncle Ray's old garage. A few slots, a little Power.",
    maxRigs: 6,
    cost: 0,
    activeRigs: 0,
    unlocks: ['Common parts'],
  },
  {
    stage: 2,
    name: 'Expanded Garage & Yard',
    description: 'Knock down the old fence and use the backyard.',
    maxRigs: 14,
    cost: 600,
    activeRigs: 3,
    quest: 'main_room_to_grow',
    unlocks: ['More rig slots', 'Cooling Unit Lv2', 'Uncommon parts'],
  },
  {
    stage: 3,
    name: 'Warehouse by the River',
    description: 'An old warehouse right next to the cold river.',
    maxRigs: 22,
    cost: 3000,
    activeRigs: 8,
    quest: 'main_cold_river',
    unlocks: ['River water cooling', 'Rooftop solar', 'Rare parts', 'Cooling Unit Lv3'],
  },
  {
    stage: 4,
    name: 'Data Center on the Hill',
    description: "Uncle Ray's secret project. Currently a very warm cat hotel.",
    maxRigs: 34,
    cost: 10000,
    activeRigs: 15,
    quest: 'main_cats_on_the_hill',
    keyItem: 'cat_bed',
    unlocks: ['Top-tier rigs', 'Epic parts', 'Service drones'],
  },
];

export function stageDef(stage: number): StageDef {
  return STAGES[Math.min(Math.max(stage, 1), 4) - 1]!;
}

/** Highest part rarity the Hardware Store sells at a given stage. */
export function maxShopRarityForStage(stage: number): 'common' | 'uncommon' | 'rare' | 'epic' {
  return (['common', 'uncommon', 'rare', 'epic'] as const)[Math.min(Math.max(stage, 1), 4) - 1]!;
}
