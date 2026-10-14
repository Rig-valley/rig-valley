/**
 * Generates the starter world as a Tiled JSON map (editable in Tiled).
 *
 * Layout follows the concept map: town square north-west, a meandering river with a
 * bridge, the Power Substation north-east, the garage and rig field south-west, the
 * warehouse by the river, and the data center on the hill south-east. Every path ends
 * at the door it leads to.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, SPAWN, TUTORIAL_SLOT, WORLD_COLS as W, WORLD_ROWS as H } from '@rig-valley/shared';
import { TILE } from './art/tiles.js';
import { rng } from './art/canvas.js';

const here = dirname(fileURLToPath(import.meta.url));
const T = 16;

type Terrain = 'grass' | 'water' | 'cobble' | 'plaza' | 'soil' | 'dirt' | 'bridge' | 'concrete';
const terrain: Terrain[][] = Array.from({ length: H }, () => Array<Terrain>(W).fill('grass'));
/** Hill is a separate overlay so roads and pads can sit on top of it. */
const hill: boolean[][] = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
const deco: number[][] = Array.from({ length: H }, () => Array<number>(W).fill(-1));
const at = (x: number, y: number): Terrain | undefined => terrain[y]?.[x];
const set = (x: number, y: number, t: Terrain) => {
  if (x >= 0 && y >= 0 && x < W && y < H) terrain[y]![x] = t;
};
const fill = (x0: number, y0: number, x1: number, y1: number, t: Terrain) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t);
};

// ------------------------------------------------------------------ terrain
// Hill (data center)
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = (x - 83) / 16;
    const dy = (y - 52) / 14;
    if (dx * dx + dy * dy < 1) hill[y]![x] = true;
  }

// River: smooth meander (corner autotiles round the banks)
const riverX = (y: number) => 57 + Math.round(1.8 * Math.sin(y / 8) + 0.8 * Math.sin(y / 3.1));
for (let y = 0; y < H; y++) fill(riverX(y), y, riverX(y) + 3, y, 'water');

// Pond
for (let y = 42; y <= 54; y++)
  for (let x = 0; x <= 12; x++)
    if (((x - 6) / 4.6) ** 2 + ((y - 48) / 3.4) ** 2 < 1) set(x, y, 'water');

// Main road and the bridge
fill(0, 19, W - 1, 20, 'cobble');
// The river meanders, so a per-row bridge would be skewed and leave half-water road
// tiles that block the player. Span every water column of rows 18-21 with one straight deck.
const riverCols = [...Array(W).keys()].filter((x) =>
  [18, 19, 20, 21].some((y) => at(x, y) === 'water'),
);
const bridgeXs: number[] = [];
for (let x = Math.min(...riverCols); x <= Math.max(...riverCols); x++) bridgeXs.push(x);
for (const x of bridgeXs) for (const y of [19, 20]) set(x, y, 'bridge');
// Water under the rails, so the deck reads as crossing the river.
for (const x of bridgeXs) for (const y of [18, 21]) set(x, y, 'water');

// Town square touching the main road (no thin connectors)
fill(10, 10, 42, 18, 'plaza');

// Garage: path along the east side of the building to the forecourt
fill(13, 21, 14, 29, 'cobble');
fill(3, 30, 15, 31, 'cobble');

// Substation access, centered on its gate
fill(75, 9, 76, 18, 'cobble');

// Warehouse: path down its west side into the front yard
fill(42, 21, 43, 37, 'cobble');
fill(44, 37, 55, 37, 'dirt');

// Data center: path up the hill to the apron in front of the building
fill(68, 21, 69, 45, 'cobble');
fill(70, 45, 83, 45, 'concrete');

// Home paths
fill(5, 16, 6, 18, 'dirt');
fill(48, 14, 49, 18, 'dirt');

// Fields (soil, data center = concrete pad)
for (const f of FIELDS) {
  fill(
    f.x - 1,
    f.y - 1,
    f.x + f.cols,
    f.y + f.rows * 2,
    f.id === 'datacenter' ? 'concrete' : 'soil',
  );
}
// Backyard access from the garage field
fill(16, 37, 17, 38, 'dirt');

// ------------------------------------------------------------------ objects
interface Obj {
  name: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  props?: Record<string, string | number | boolean>;
}
const objects: Obj[] = [];
const colliders: { x: number; y: number; w: number; h: number; tag?: string }[] = [];
const reserved: { x: number; y: number; w: number; h: number }[] = [];

function sprite(
  name: string,
  key: string,
  tx: number,
  tyBottom: number,
  w: number,
  h: number,
  props: Obj['props'] = {},
) {
  objects.push({
    name,
    type: 'sprite',
    x: tx * T,
    y: tyBottom * T,
    width: w,
    height: h,
    props: { key, ...props },
  });
  reserved.push({ x: tx, y: tyBottom - h / T, w: w / T, h: h / T });
}
function point(name: string, type: string, tx: number, ty: number, props: Obj['props'] = {}) {
  objects.push({ name, type, x: tx * T + 8, y: ty * T + 8, props });
}
/** Interaction zone in tiles. `label` is shown in prompts and the tutorial guide. */
function zone(
  name: string,
  action: string,
  tx: number,
  ty: number,
  tw = 1,
  th = 1,
  props: Obj['props'] = {},
) {
  objects.push({
    name,
    type: 'interact',
    x: tx * T,
    y: ty * T,
    width: tw * T,
    height: th * T,
    props: { action, ...props },
  });
}
function block(tx: number, ty: number, tw: number, th: number, tag?: string) {
  colliders.push({ x: tx, y: ty, w: tw, h: th, tag });
}
function light(tx: number, ty: number, radius: number, color: string, flicker = false) {
  objects.push({
    name: 'light',
    type: 'light',
    x: tx * T,
    y: ty * T,
    props: { radius, color, flicker },
  });
}
function lamp(x: number, y: number) {
  sprite('lamp', 'prop_lamp', x, y + 1, 16, 36);
  block(x + 0.3, y + 0.4, 0.4, 0.6);
  light(x + 0.5, y - 1.4, 56, 'warm', true);
}

// --- Town -----------------------------------------------------------------
const shops = [
  { id: 'hardware', x: 12, npc: 'mia', label: 'Hardware Store' },
  { id: 'cafe', x: 22, npc: 'bo', label: "Miner's Café" },
  { id: 'repair', x: 32, npc: 'dex', label: 'Repair Shop' },
] as const;
for (const s of shops) {
  sprite(s.id, `bld_${s.id}`, s.x, 10, 80, 72);
  block(s.x + 0.25, 6, 4.5, 4);
  zone(`${s.id}_door`, `shop:${s.id}`, s.x + 2, 9, 1, 1, { label: s.label });
  point(`npc_${s.npc}`, 'npc', s.x + 3.4, 10.4, { npc: s.npc, shop: s.id });
  light(s.x + 1.1, 8.3, 36, 'warm');
  light(s.x + 3.9, 8.3, 36, 'warm');
  sprite('flowerbed', 'prop_flowerbed', s.x + 3.2, 10.9, 32, 14);
}
// Statue sits mid-square, clear of the café door so Bo is easy to reach.
sprite('statue', 'prop_statue', 25, 17, 32, 28);
block(25.1, 15.4, 1.8, 1.4);
point('holocoin', 'holocoin', 25.5, 13.5);
light(26, 14.5, 64, 'cyan');
zone('statue', 'statue', 25, 15, 2, 2, { label: 'Coin statue' });
// Market Board on the east side of the square, clear of Dex's door.
sprite('market', 'prop_board', 39.5, 15, 32, 32);
block(39.7, 14, 1.6, 1);
zone('market', 'market', 39.5, 14, 2, 1, { label: 'Market Board' });
sprite('bench1', 'prop_bench', 18, 16, 24, 16);
block(18, 15.3, 1.5, 0.7);
sprite('bench2', 'prop_bench', 31, 16, 24, 16);
block(31, 15.3, 1.5, 0.7);
sprite('well', 'prop_well', 13, 16, 24, 28);
block(13.1, 15, 1.3, 1);
sprite('stand', 'prop_stand', 20, 13.6, 32, 36, { festival: true });
zone('festival', 'festival', 20, 12.6, 2, 1, { festival: true, label: 'Festival stand' });
point('npc_kai', 'npc', 29, 15, { npc: 'kai', wander: true });
for (const [x, y] of [
  [10, 10],
  [42, 10],
  [10, 17],
  [42, 17],
] as const)
  lamp(x, y);

// Homes
sprite('home_w', 'prop_house1', 3, 16, 64, 60);
block(3.3, 12.5, 3.4, 3.5);
sprite('home_e', 'prop_house2', 46, 14, 64, 60);
block(46.3, 10.5, 3.4, 3.5);
sprite('home_ne', 'prop_house3', 86, 30, 64, 60);
block(86.3, 26.5, 3.4, 3.5);
fill(87, 21, 88, 29, 'dirt');
for (const [x, y] of [
  [8, 15],
  [51, 12],
] as const)
  sprite('crates', 'prop_crates', x, y + 1, 20, 18);
for (const [x, y] of [
  [2, 15],
  [45, 13],
] as const)
  sprite('barrel', 'prop_barrel', x, y + 1, 12, 16);

// --- Substation -----------------------------------------------------------
sprite('substation', 'bld_substation', 72, 8.5, 112, 72);
block(72, 4, 7, 4.5);
zone('substation_gate', 'shop:substation', 75, 8, 2, 1, { label: 'Power Substation' });
point('npc_vera', 'npc', 77.4, 9.6, { npc: 'vera', shop: 'substation' });
light(75.5, 6, 64, 'cyan');

// --- Garage (player home) -------------------------------------------------
sprite('garage', 'bld_garage', 4, 30, 112, 84);
block(4, 25, 7, 5);
zone('garage_door', 'sleep', 6, 29, 3, 1, { label: 'Garage door' });
light(7.5, 29, 72, 'cyan');
light(10.4, 27.6, 40, 'warm');
sprite('mailbox', 'prop_mailbox', 12, 30, 16, 20);
block(12.2, 29.4, 0.6, 0.6);
zone('mailbox', 'mailbox', 12, 29, 1, 1, { label: 'Mailbox' });
sprite('box', 'prop_box', 10, 31, 16, 14, { box: true });
block(10.1, 30.3, 0.8, 0.7, 'box');
zone('box', 'box', 10, 30, 1, 1, { label: "Uncle Ray's box" });
sprite('mat', 'prop_mat', 6.5, 30.4, 16, 8);
sprite('crates_g', 'prop_crates', 2, 31, 20, 18);
block(2, 30.2, 1.2, 0.8);
for (const y of [22, 25, 28]) {
  sprite('bollard', 'prop_bollard', 12, y + 1, 8, 16);
  block(12.1, y + 0.5, 0.3, 0.5);
  light(12.25, y + 0.2, 20, 'warm');
}

// --- Fields: fences, signs and lock blockers --------------------------------
for (const f of FIELDS) {
  const x0 = f.x - 1;
  const x1 = f.x + f.cols;
  const y0 = f.y - 1;
  const y1 = f.y + f.rows * 2;
  if (f.id === 'garage' || f.id === 'yard') {
    for (let x = x0; x <= x1; x++) {
      if (f.id === 'yard' && (x === x0 || x === x0 + 1)) continue; // entrance from the garage field
      deco[y0 - 1]![x] = TILE.fenceH;
      block(x, y0 - 1 + 0.4, 1, 0.6);
    }
  }
  if (f.id === 'river') {
    for (let x = x0 + 2; x <= x1; x++) {
      deco[y0 - 1]![x] = TILE.fenceH;
      block(x, y0 - 1 + 0.4, 1, 0.6);
    }
  }
  if (f.stage > 1) {
    block(x0, y0, x1 - x0 + 1, y1 - y0 + 1, `lock_${f.stage}`);
    const sx = f.id === 'river' ? x0 - 2 : x0 - 1;
    const sy = f.id === 'river' ? y0 - 1 : y0;
    sprite(`sign_${f.stage}`, 'prop_sign', sx, sy + 1, 16, 22);
    block(sx + 0.2, sy + 0.4, 0.6, 0.6);
    zone(`gate_${f.stage}`, `gate:${f.stage}`, sx, sy, 1, 1, { label: `${f.name} sign` });
  }
}

// --- Warehouse ------------------------------------------------------------
sprite('warehouse', 'bld_warehouse', 44, 37, 128, 80);
block(44, 32, 8, 5);
light(48, 35.5, 56, 'cyan');
sprite('crates_w', 'prop_crates', 52.3, 37, 20, 18);
sprite('barrel_w', 'prop_barrel', 53.8, 37, 12, 16);

// --- Data center ----------------------------------------------------------
sprite('datacenter', 'bld_datacenter', 73, 45, 144, 88);
block(73, 40, 9, 5);
light(77.5, 43, 96, 'magenta');
light(73, 42, 64, 'cyan');
for (const [x, y, coat] of [
  [74, 47, 0],
  [77, 49, 1],
  [80, 47, 0],
] as const)
  point('cat', 'cat', x, y, { coat, stage: 4 });

// --- Power line along the main road (wires drawn in-game) ------------------
const poleXs = [2, 46, 54, 64, 74, 84, 94];
for (const x of poleXs) {
  sprite('pole', 'prop_pole', x, 19, 16, 48, { pole: true });
  block(x + 0.4, 18.3, 0.2, 0.7);
}

// --- Street lamps & signposts ----------------------------------------------
for (const [x, y] of [
  [8, 21],
  [20, 21],
  [38, 21],
  [50, 18],
  [66, 18],
  [80, 21],
  [41, 30],
  [67, 32],
  [67, 42],
] as const)
  lamp(x, y);
for (const [x, y, dir] of [
  [15, 21, 'Garage'],
  [44, 21, 'Warehouse'],
  [70, 21, 'Data Center'],
  [77, 17, 'Substation'],
] as const) {
  sprite('signpost', 'prop_signpost', x, y + 1, 24, 28, { text: dir });
  block(x + 0.6, y + 0.5, 0.3, 0.5);
}

// --- Pond decor --------------------------------------------------------------
for (const [x, y] of [
  [2, 45],
  [9, 50],
  [3, 51],
] as const)
  sprite('reeds', 'prop_reeds', x, y + 1, 12, 10);

// --- Nature ----------------------------------------------------------------
const r = rng(42);
const isOpen = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H && at(x, y) === 'grass' && !hill[y]![x];
const nearThings = (x: number, y: number, pad: number) =>
  reserved.some(
    (o) => x >= o.x - pad && x < o.x + o.w + pad && y >= o.y - pad && y < o.y + o.h + pad,
  ) ||
  colliders.some(
    (c) =>
      c.w < 30 && x >= c.x - pad && x < c.x + c.w + pad && y >= c.y - pad && y < c.y + c.h + pad,
  );
const nearPath = (x: number, y: number, pad: number) => {
  for (let dy = -pad; dy <= pad; dy++)
    for (let dx = -pad; dx <= pad; dx++) {
      const t = at(x + dx, y + dy);
      if (t && t !== 'grass') return true;
    }
  return false;
};
const trees: [number, number, string][] = [];
function tryTree(tx: number, ty: number) {
  if (!isOpen(tx, ty) || !isOpen(tx + 1, ty) || nearPath(tx, ty, 1) || nearThings(tx, ty, 1))
    return;
  if (Math.abs(tx - SPAWN.x) < 5 && Math.abs(ty - SPAWN.y) < 5) return;
  if (trees.some(([ox, oy]) => Math.abs(ox - tx) < 2 && Math.abs(oy - ty) < 2)) return;
  const v = r();
  trees.push([tx, ty, v < 0.3 ? 'prop_pine' : v < 0.6 ? 'prop_tree2' : 'prop_tree']);
}
// Forest belt around the edges
for (let y = 2; y < H; y += 2)
  for (let x = 0; x < W; x += 2) {
    const edge = Math.min(x, y - 2, W - 1 - x, H - 1 - y);
    if (edge < 3 && r() < 0.85) tryTree(x + Math.floor(r() * 2), y + Math.floor(r() * 2));
  }
// Groves (clusters, not random noise)
const groves = [
  [26, 26, 4],
  [34, 46, 5],
  [36, 57, 4],
  [22, 54, 4],
  [50, 54, 3],
  [62, 32, 3],
  [30, 4, 3],
  [52, 5, 3],
  [88, 12, 4],
  [64, 9, 3],
] as const;
for (const [cx, cy, rad] of groves)
  for (let i = 0; i < rad * 3; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * rad;
    tryTree(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d));
  }
// Hill trees
for (let i = 0; i < 24; i++) {
  const x = 68 + Math.floor(r() * 27);
  const y = 38 + Math.floor(r() * 25);
  if (hill[y]?.[x] && !nearPath(x, y, 1) && !nearThings(x, y, 1))
    trees.push([x, y, r() < 0.5 ? 'prop_pine' : 'prop_tree']);
}
for (const [x, y, kind] of trees) {
  const w = kind === 'prop_pine' ? 24 : 32;
  sprite('tree', kind, x, y + 1, w, 40);
  block(x + (w === 24 ? 0.55 : 0.8), y + 0.4, 0.5, 0.6);
}
// Bushes, rocks and flowers in small clusters along paths and buildings
for (let i = 0; i < 90; i++) {
  const x = Math.floor(r() * W);
  const y = 3 + Math.floor(r() * (H - 4));
  if (
    !isOpen(x, y) ||
    nearThings(x, y, 1) ||
    trees.some(([tx, ty]) => Math.abs(tx - x) < 2 && Math.abs(ty - y) < 2)
  )
    continue;
  if (!nearPath(x, y, 3)) continue;
  const v = r();
  const key = v < 0.45 ? 'prop_bush' : v < 0.75 ? 'prop_bush2' : 'prop_rock';
  sprite(key.slice(5), key, x, y + 1, 16, 14);
  block(x + 0.2, y + 0.4, 0.6, 0.6);
}

// World border
block(-1, -1, W + 2, 1);
block(-1, H, W + 2, 1);
block(-1, -1, 1, H + 2);
block(W, -1, 1, H + 2);

point('spawn', 'spawn', SPAWN.x, SPAWN.y);
point('tutorial_rig', 'marker', TUTORIAL_SLOT.x, TUTORIAL_SLOT.y);

// ------------------------------------------------------------------ tile layers
function sideMask(x: number, y: number, same: (t: Terrain | undefined) => boolean): number {
  let m = 0;
  if (y > 0 && !same(at(x, y - 1))) m |= 1;
  if (x < W - 1 && !same(at(x + 1, y))) m |= 2;
  if (y < H - 1 && !same(at(x, y + 1))) m |= 4;
  if (x > 0 && !same(at(x - 1, y))) m |= 8;
  return m;
}
/** Corner mask: a tile corner is "in" when at least 2 of the 4 cells sharing it are. */
function cornerMask(isIn: (x: number, y: number) => boolean, x: number, y: number): number {
  const v = (cx: number, cy: number) => {
    let n = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const)
      if (isIn(Math.min(W - 1, Math.max(0, cx + dx)), Math.min(H - 1, Math.max(0, cy + dy)))) n++;
    return n >= 2;
  };
  return (
    (v(x, y) ? 1 : 0) | (v(x + 1, y) ? 2 : 0) | (v(x, y + 1) ? 4 : 0) | (v(x + 1, y + 1) ? 8 : 0)
  );
}
const isWater = (x: number, y: number) => at(x, y) === 'water' || at(x, y) === 'bridge';
const isHill = (x: number, y: number) => !!hill[y]?.[x];

const ground: number[] = [];
const gr = rng(7);
const flowerPatch = (x: number, y: number) =>
  Math.sin(x * 0.37 + y * 0.23) + Math.sin(x * 0.11 - y * 0.41) > 1.35;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = at(x, y)!;
    let idx: number;
    switch (t) {
      case 'grass': {
        const wm = cornerMask(isWater, x, y);
        if (wm) {
          idx = TILE.waterA + wm;
          break;
        }
        const hm = cornerMask(isHill, x, y);
        if (hm === 15) {
          idx = TILE.hill + Math.floor(gr() * 2);
          break;
        }
        if (hm) {
          idx = TILE.hillEdge + hm;
          break;
        }
        const v = gr();
        if (flowerPatch(x, y) && v < 0.5)
          idx = [TILE.grassFlowersCyan, TILE.grassFlowersMagenta, TILE.grassFlowersYellow][
            Math.floor(gr() * 3)
          ]!;
        else if (v < 0.04) idx = TILE.grassClover;
        else if (v < 0.07) idx = TILE.tallGrass;
        else if (v < 0.1) idx = TILE.grassDark;
        else idx = TILE.grass + Math.floor(gr() * 4);
        break;
      }
      case 'water':
        idx = TILE.waterA + (cornerMask(isWater, x, y) || 15);
        break;
      case 'cobble':
        idx =
          TILE.cobble +
          sideMask(
            x,
            y,
            (n) => n === 'cobble' || n === 'plaza' || n === 'bridge' || n === undefined,
          );
        break;
      case 'plaza':
        idx =
          TILE.plaza + sideMask(x, y, (n) => n === 'plaza' || n === 'cobble' || n === undefined);
        break;
      case 'soil':
        idx = TILE.soil + sideMask(x, y, (n) => n === 'soil');
        break;
      case 'dirt':
        idx = TILE.dirt + sideMask(x, y, (n) => n !== 'grass' && n !== 'water');
        break;
      case 'bridge':
        idx = TILE.bridgeH;
        break;
      case 'concrete':
        idx = at(x, y + 1) === 'concrete' ? TILE.concrete : TILE.concreteEdge;
        break;
    }
    ground.push(idx + 1);
  }
}
// Bridge rails above and below the deck
for (const x of bridgeXs) {
  deco[18]![x] = TILE.bridgeRailTop;
  deco[21]![x] = TILE.bridgeRailBottom;
  block(x, 18.4, 1, 0.6);
  block(x, 21, 1, 0.5);
}
// Water is solid where the tile is mostly water
for (let y = 0; y < H; y++) {
  let start = -1;
  for (let x = 0; x <= W; x++) {
    // The main road (rows 19-20) is always walkable, bridge included.
    const road = y === 19 || y === 20;
    const m = x < W && !road && at(x, y) !== 'bridge' ? cornerMask(isWater, x, y) : 0;
    const solid = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) >= 2;
    if (solid && start < 0) start = x;
    if (!solid && start >= 0) {
      block(start, y, x - start, 1);
      start = -1;
    }
  }
}

const decoData = deco.flat().map((v) => (v < 0 ? 0 : v + 1));

let nextId = 1;
const prop = (value: string | number | boolean) =>
  typeof value === 'number'
    ? Number.isInteger(value)
      ? 'int'
      : 'float'
    : typeof value === 'boolean'
      ? 'bool'
      : 'string';
const tiled = {
  compressionlevel: -1,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.10.2',
  type: 'map',
  version: '1.10',
  nextlayerid: 5,
  layers: [
    {
      id: 1,
      name: 'ground',
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: ground,
    },
    {
      id: 2,
      name: 'deco',
      type: 'tilelayer',
      width: W,
      height: H,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data: decoData,
    },
    {
      id: 3,
      name: 'objects',
      type: 'objectgroup',
      draworder: 'topdown',
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
      objects: objects.map((o) => ({
        id: nextId++,
        name: o.name,
        type: o.type,
        x: o.x,
        y: o.y,
        width: o.width ?? 0,
        height: o.height ?? 0,
        rotation: 0,
        visible: true,
        ...(o.width === undefined ? { point: true } : {}),
        properties: Object.entries(o.props ?? {}).map(([name, value]) => ({
          name,
          type: prop(value),
          value,
        })),
      })),
    },
    {
      id: 4,
      name: 'colliders',
      type: 'objectgroup',
      draworder: 'topdown',
      opacity: 1,
      visible: false,
      x: 0,
      y: 0,
      objects: colliders.map((c) => ({
        id: nextId++,
        name: c.tag ?? '',
        type: 'collider',
        x: c.x * T,
        y: c.y * T,
        width: c.w * T,
        height: c.h * T,
        rotation: 0,
        visible: true,
      })),
    },
  ],
  nextobjectid: nextId,
  tilesets: [
    {
      firstgid: 1,
      name: 'tiles',
      image: '../assets/tiles.png',
      imagewidth: 256,
      imageheight: 144,
      tilewidth: T,
      tileheight: T,
      columns: 16,
      tilecount: 144,
      margin: 0,
      spacing: 0,
    },
  ],
};

const out = join(here, '../public/maps/world.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(tiled));
console.log(
  `Map written: ${W}×${H}, ${objects.length} objects, ${colliders.length} colliders → ${out}`,
);
