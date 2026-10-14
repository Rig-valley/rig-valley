/**
 * 16×16 terrain tileset.
 *
 * Two autotiling schemes:
 *  - Side masks (roads, plaza, fields, dirt paths): 4 bits N=1, E=2, S=4, W=8 set when
 *    that side borders a different terrain.
 *  - Corner masks (water, hill): 4 bits TL=1, TR=2, BL=4, BR=8 set when that tile corner
 *    is inside the terrain. Edges are interpolated per pixel, so rivers, ponds and the hill
 *    get rounded, natural shorelines instead of staircase steps.
 */
import { RAMPS } from '@rig-valley/shared';
import { Canvas, bayer, rng } from './canvas.js';

const G = RAMPS.grass;
const W = RAMPS.water;
const S = RAMPS.stone;
const SO = RAMPS.soil;
const WD = RAMPS.wood;
const M = RAMPS.metal;
const N = RAMPS.night;

export const T = 16;
export const COLS = 16;
export const ROWS = 9;

/** Tile index layout (0-based, Tiled gid = index + 1). */
export const TILE = {
  grass: 0, // 0..3 variants
  grassFlowersCyan: 4,
  grassFlowersMagenta: 5,
  grassFlowersYellow: 6,
  grassClover: 7,
  tallGrass: 8,
  grassDark: 9,
  hill: 10, // 10..11 plain hill grass
  waterA: 16, // + corner mask
  waterB: 32, // + corner mask
  cobble: 48, // + side mask
  plaza: 64, // + side mask
  soil: 80, // + side mask
  hillEdge: 96, // + corner mask
  dirt: 112, // + side mask
  bridgeH: 128,
  bridgeRailTop: 129,
  bridgeRailBottom: 130,
  concrete: 131,
  fenceH: 132,
  fenceV: 133,
  fencePost: 134,
  hedge: 135,
  floorWood: 136,
  concreteEdge: 137,
} as const;

function grassBase(c: Canvas, ox: number, oy: number, seed: number, light = false) {
  const r = rng(seed);
  const base = light ? G[3] : G[2];
  const shade = light ? G[2] : G[1];
  const tuft = light ? G[4] : G[3];
  c.rect(ox, oy, T, T, base);
  const px = r() * 16;
  const py = r() * 16;
  c.dither(ox, oy, T, T, shade, (x, y) => Math.max(0, 0.5 - Math.hypot(x - px, y - py) / 18));
  const blades = 3 + Math.floor(r() * 4);
  for (let i = 0; i < blades; i++) {
    const x = Math.floor(r() * 15);
    const y = 2 + Math.floor(r() * 13);
    c.px(ox + x, oy + y, tuft);
    c.px(ox + x, oy + y - 1, tuft);
    if (r() < 0.5) c.px(ox + x + 1, oy + y, shade);
  }
}

/** Bilinear corner value at pixel (x,y) for a corner mask (TL=1, TR=2, BL=4, BR=8). */
function cornerValue(mask: number, x: number, y: number): number {
  const u = (x + 0.5) / T;
  const v = (y + 0.5) / T;
  const tl = mask & 1 ? 1 : 0;
  const tr = mask & 2 ? 1 : 0;
  const bl = mask & 4 ? 1 : 0;
  const br = mask & 8 ? 1 : 0;
  const top = tl + (tr - tl) * u;
  const bot = bl + (br - bl) * u;
  const val = top + (bot - top) * v;
  // A touch of ordered noise keeps edges from looking vector-smooth.
  return val + (bayer(x, y) - 0.5) * 0.06;
}

function waterTile(c: Canvas, ox: number, oy: number, mask: number, frame: number) {
  grassBase(c, ox, oy, 900 + mask);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const v = cornerValue(mask, x, y);
      if (v < 0.36) continue;
      if (v < 0.5) {
        // bank: dark end of the grass ramp
        c.px(ox + x, oy + y, v < 0.43 ? G[1] : G[0]);
        continue;
      }
      // water body + ripples
      const wave =
        Math.sin((x + frame * 3) * 0.7 + y * 1.3) + Math.sin((y - frame * 2) * 0.5 - x * 0.4);
      let col: string = W[1];
      if (wave > 1.35) col = W[2];
      else if (wave < -1.55) col = W[0];
      // shadow just inside the shore (light comes from the top-left)
      if (v < 0.62) col = W[0];
      c.px(ox + x, oy + y, col);
    }
  }
  if (mask === 15) {
    const s = frame === 0 ? [3, 5] : [10, 11];
    c.px(ox + s[0]!, oy + s[1]!, W[3]);
    c.px(ox + ((s[0]! + 7) % 16), oy + ((s[1]! + 6) % 16), W[3]);
  }
}

function hillTile(c: Canvas, ox: number, oy: number, mask: number) {
  grassBase(c, ox, oy, 700 + mask);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const v = cornerValue(mask, x, y);
      if (v < 0.42) continue;
      if (v < 0.5) {
        // drop shadow of the slope onto the low ground
        if (bayer(x, y) < 0.5) c.px(ox + x, oy + y, G[1]);
        continue;
      }
      if (v < 0.58) {
        c.px(ox + x, oy + y, G[2]); // slope face
        continue;
      }
      if (v < 0.66 && bayer(x, y) < 0.5) {
        c.px(ox + x, oy + y, G[4]); // lit rim
        continue;
      }
      // plateau: lighter grass
      const keep = c.get(ox + x, oy + y);
      c.px(ox + x, oy + y, keep === G[1] ? G[2] : keep === G[3] ? G[4] : G[3]);
    }
  }
}

function cobbleTile(c: Canvas, ox: number, oy: number, mask: number, seed: number) {
  const r = rng(seed);
  c.rect(ox, oy, T, T, S[1]);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 0 : 2;
    for (let col = -1; col < 5; col++) {
      const x = col * 4 + off;
      const y = row * 4;
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= T) continue;
          c.px(ox + xx, oy + y + j, S[2]);
        }
      if (x >= 0 && x < T) c.px(ox + x, oy + y, S[3]);
      if (r() < 0.12 && x + 1 >= 0 && x + 1 < T) c.px(ox + x + 1, oy + y + 1, S[3]);
    }
  }
  curbs(c, ox, oy, mask);
}

/** 2 px curbs on edges. Light from top-left: top/left curb lighter. */
function curbs(c: Canvas, ox: number, oy: number, mask: number) {
  if (mask & 1) {
    c.hline(ox, oy, T, S[4]);
    c.hline(ox, oy + 1, T, S[3]);
  }
  if (mask & 4) {
    c.hline(ox, oy + T - 2, T, S[3]);
    c.hline(ox, oy + T - 1, T, S[0]);
  }
  if (mask & 8) {
    c.vline(ox, oy, T, S[4]);
    c.vline(ox + 1, oy, T, S[3]);
  }
  if (mask & 2) {
    c.vline(ox + T - 2, oy, T, S[3]);
    c.vline(ox + T - 1, oy, T, S[0]);
  }
  // clean corners where two curbs meet
  if (mask & 1 && mask & 8) c.px(ox, oy, S[4]);
  if (mask & 1 && mask & 2) c.px(ox + T - 1, oy, S[3]);
  if (mask & 4 && mask & 8) c.px(ox, oy + T - 1, S[3]);
  if (mask & 4 && mask & 2) c.px(ox + T - 1, oy + T - 1, S[0]);
}

function plazaTile(c: Canvas, ox: number, oy: number, mask: number) {
  c.rect(ox, oy, T, T, S[2]);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (x % 8 === 0 || y % 8 === 0) c.px(ox + x, oy + y, S[1]);
      else if (x % 8 === 1 && y % 8 !== 0) c.px(ox + x, oy + y, S[3]);
    }
  c.dither(ox, oy, T, T, S[1], 0.06);
  curbs(c, ox, oy, mask);
}

function soilTile(c: Canvas, ox: number, oy: number, mask: number) {
  c.rect(ox, oy, T, T, SO[1]);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (y % 4 === 3) c.px(ox + x, oy + y, SO[0]);
      else if (y % 4 === 0 && bayer(x, y) < 0.3) c.px(ox + x, oy + y, SO[2]);
    }
  if (mask & 1) {
    c.hline(ox, oy, T, WD[2]);
    c.hline(ox, oy + 1, T, WD[1]);
  }
  if (mask & 4) {
    c.hline(ox, oy + T - 2, T, WD[1]);
    c.hline(ox, oy + T - 1, T, WD[0]);
  }
  if (mask & 8) {
    c.vline(ox, oy, T, WD[2]);
    c.vline(ox + 1, oy, T, WD[1]);
  }
  if (mask & 2) {
    c.vline(ox + T - 2, oy, T, WD[1]);
    c.vline(ox + T - 1, oy, T, WD[0]);
  }
}

/** Dirt path that fades into the grass on open sides. */
function dirtTile(c: Canvas, ox: number, oy: number, mask: number) {
  grassBase(c, ox, oy, 1200 + mask);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let edge = 99;
      if (mask & 1) edge = Math.min(edge, y);
      if (mask & 4) edge = Math.min(edge, T - 1 - y);
      if (mask & 8) edge = Math.min(edge, x);
      if (mask & 2) edge = Math.min(edge, T - 1 - x);
      if (edge < 2) continue;
      if (edge < 4 && bayer(x, y) < (edge - 1) / 3) continue;
      const pebble = (x * 7 + y * 13) % 23 === 0;
      c.px(ox + x, oy + y, pebble ? SO[3] : bayer(x + 1, y) < 0.22 ? SO[1] : SO[2]);
    }
}

export function buildTileset(): Canvas {
  const c = new Canvas(COLS * T, ROWS * T);
  const at = (i: number) => [(i % COLS) * T, Math.floor(i / COLS) * T] as const;

  for (let i = 0; i < 4; i++) {
    const [x, y] = at(TILE.grass + i);
    grassBase(c, x, y, 100 + i);
  }
  const flowers = [
    [TILE.grassFlowersCyan, RAMPS.cyan[1]],
    [TILE.grassFlowersMagenta, RAMPS.magenta[1]],
    [TILE.grassFlowersYellow, RAMPS.warm[1]],
  ] as const;
  for (const [idx, col] of flowers) {
    const [x, y] = at(idx);
    grassBase(c, x, y, 200 + idx);
    for (const [fx, fy] of [
      [3, 4],
      [11, 7],
      [6, 12],
      [13, 13],
    ]) {
      c.px(x + fx!, y + fy!, col);
      c.px(x + fx! + 1, y + fy!, col);
      c.px(x + fx!, y + fy! + 1, G[4]);
    }
  }
  {
    const [x, y] = at(TILE.grassClover);
    grassBase(c, x, y, 333);
    for (const [fx, fy] of [
      [4, 5],
      [10, 9],
      [6, 11],
    ]) {
      c.px(x + fx!, y + fy!, G[4]);
      c.px(x + fx! + 1, y + fy!, G[4]);
      c.px(x + fx!, y + fy! + 1, G[4]);
      c.px(x + fx! + 1, y + fy! + 1, G[3]);
    }
  }
  {
    const [x, y] = at(TILE.tallGrass);
    grassBase(c, x, y, 777);
    for (let i = 0; i < 16; i += 2) {
      const h = 5 + ((i * 7) % 5);
      c.vline(x + i, y + 15 - h, h, G[3]);
      c.px(x + i, y + 15 - h, G[4]);
      c.px(x + i + 1, y + 15 - Math.floor(h / 2), G[1]);
    }
  }
  {
    const [x, y] = at(TILE.grassDark);
    grassBase(c, x, y, 555);
    c.dither(x, y, T, T, G[1], 0.45);
  }
  for (let i = 0; i < 2; i++) {
    const [x, y] = at(TILE.hill + i);
    hillTile(c, x, y, 15);
  }
  for (let m = 0; m < 16; m++) {
    let [x, y] = at(TILE.waterA + m);
    waterTile(c, x, y, m, 0);
    [x, y] = at(TILE.waterB + m);
    waterTile(c, x, y, m, 1);
    [x, y] = at(TILE.cobble + m);
    cobbleTile(c, x, y, m, 400 + m);
    [x, y] = at(TILE.plaza + m);
    plazaTile(c, x, y, m);
    [x, y] = at(TILE.soil + m);
    soilTile(c, x, y, m);
    [x, y] = at(TILE.hillEdge + m);
    hillTile(c, x, y, m);
    [x, y] = at(TILE.dirt + m);
    dirtTile(c, x, y, m);
  }

  // bridge planks + rails
  {
    const [x, y] = at(TILE.bridgeH);
    c.rect(x, y, T, T, WD[2]);
    for (let i = 0; i < T; i += 4) {
      c.vline(x + i, y, T, WD[1]);
      c.px(x + i + 2, y + 3, WD[3]);
      c.px(x + i + 1, y + 11, WD[3]);
    }
    const [x3, y3] = at(TILE.bridgeRailTop);
    c.rect(x3, y3 + 8, T, 8, WD[2]);
    for (let i = 0; i < T; i += 4) c.vline(x3 + i, y3 + 8, 8, WD[1]);
    c.rect(x3, y3, T, 8, W[1]);
    c.hline(x3, y3 + 6, T, WD[3]);
    c.hline(x3, y3 + 7, T, WD[0]);
    for (let i = 1; i < T; i += 5) c.rect(x3 + i, y3 + 3, 2, 4, WD[3]);
    const [x4, y4] = at(TILE.bridgeRailBottom);
    c.rect(x4, y4, T, 8, WD[2]);
    for (let i = 0; i < T; i += 4) c.vline(x4 + i, y4, 8, WD[1]);
    c.hline(x4, y4 + 6, T, WD[3]);
    c.hline(x4, y4 + 7, T, WD[0]);
    c.rect(x4, y4 + 8, T, 8, W[1]);
    c.hline(x4, y4 + 8, T, W[0]);
    c.hline(x4, y4 + 9, T, W[0]);
  }
  // concrete pad (+ edge variant with a lit lip)
  {
    const [x, y] = at(TILE.concrete);
    c.rect(x, y, T, T, M[1]);
    c.dither(x, y, T, T, M[0], 0.1);
    c.hline(x, y, T, M[0]);
    c.vline(x, y, T, M[0]);
    c.px(x + 1, y + 1, M[2]);
    const [x2, y2] = at(TILE.concreteEdge);
    c.blit(c, x2, y2, x, y, T, T);
    c.hline(x2, y2 + T - 2, T, M[2]);
    c.hline(x2, y2 + T - 1, T, M[0]);
  }
  // fences (wood, dark outline)
  {
    const [x, y] = at(TILE.fenceH);
    c.rect(x, y + 6, T, 2, WD[3]);
    c.rect(x, y + 8, T, 1, WD[1]);
    c.rect(x, y + 11, T, 2, WD[2]);
    c.rect(x, y + 13, T, 1, WD[0]);
    c.rect(x + 7, y + 3, 2, 12, WD[2]);
    c.vline(x + 7, y + 3, 12, WD[3]);
    c.hline(x + 7, y + 2, 2, N[0]);
    const [x2, y2] = at(TILE.fenceV);
    c.rect(x2 + 7, y2, 2, T, WD[2]);
    c.vline(x2 + 7, y2, T, WD[3]);
    c.vline(x2 + 9, y2, T, N[0]);
    c.vline(x2 + 6, y2, T, N[0]);
    const [x3, y3] = at(TILE.fencePost);
    c.rect(x3 + 6, y3 + 2, 4, 13, WD[2]);
    c.vline(x3 + 6, y3 + 2, 13, WD[3]);
    c.box(x3 + 5, y3 + 1, 6, 15, N[0]);
  }
  {
    const [x, y] = at(TILE.hedge);
    c.rect(x + 1, y + 2, 14, 13, G[2]);
    c.dither(x + 1, y + 2, 14, 13, G[3], (_i, j) => (j < 5 ? 0.5 : 0.15));
    c.dither(x + 1, y + 2, 14, 13, G[1], (_i, j) => (j > 9 ? 0.6 : 0));
    c.box(x, y + 1, 16, 15, G[0]);
  }
  {
    const [x, y] = at(TILE.floorWood);
    c.rect(x, y, T, T, WD[1]);
    for (let j = 0; j < T; j += 4) c.hline(x, y + j, T, WD[0]);
    c.dither(x, y, T, T, WD[2], 0.15);
  }
  return c;
}
