/**
 * Player and NPC sprites (16×24, 4 directions × 4 frames) and 32×32 portraits.
 * The player is layered: body + hair (per color) + hat, so customization
 * never needs one sheet per combination.
 */
import { HAIR_COLORS, RAMPS } from '@rig-valley/shared';
import { Canvas } from './canvas.js';

const N = RAMPS.night;
const WD = RAMPS.wood;
const WA = RAMPS.warm;
const OUT = N[0];

export const CW = 16;
export const CH = 24;
export const DIRS = ['down', 'left', 'right', 'up'] as const;
export type Dir = (typeof DIRS)[number];

interface Look {
  skin: [string, string]; // base, shade
  shirt: [string, string];
  pants: [string, string];
  shoes: string;
  hair?: (c: Canvas, dir: Dir, bob: number) => void;
  extra?: (c: Canvas, dir: Dir, bob: number, frame: number) => void;
}

/** Hair shade pairs from the palette for each hair color option. */
export const HAIR_SHADES: Record<string, [string, string]> = {
  ink: [N[3], N[1]],
  chestnut: [WD[2], WD[1]],
  copper: [WD[3], WD[2]],
  honey: [WA[1], WA[0]],
  mint: [RAMPS.green[1], RAMPS.green[0]],
  magenta: [RAMPS.magenta[1], RAMPS.magenta[0]],
};

function body(c: Canvas, look: Look, dir: Dir, frame: number) {
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const bob = step !== 0 ? 1 : 0;
  const [sk, skS] = look.skin;
  const [sh, shS] = look.shirt;
  const [pa, paS] = look.pants;
  // shadow
  c.dither(4, 22, 8, 2, N[0], 0.6);
  // legs
  if (dir === 'down' || dir === 'up') {
    const l = step === 1 ? 1 : 0;
    const r = step === -1 ? 1 : 0;
    c.rect(5, 17, 3, 4 - l + 1, pa);
    c.rect(8, 17, 3, 4 - r + 1, paS);
    c.rect(5, 21 - l, 3, 1, look.shoes);
    c.rect(8, 21 - r, 3, 1, look.shoes);
  } else {
    const fx = dir === 'left' ? -1 : 1;
    c.rect(6, 17, 4, 4, pa);
    if (step !== 0) {
      c.rect(6 + step * fx, 18, 2, 3, paS);
      c.rect(8 - step * fx, 18, 2, 3, pa);
    }
    c.rect(6 + (step === 1 ? fx : 0), 21, 2, 1, look.shoes);
    c.rect(8 - (step === -1 ? fx : 0), 21, 2, 1, look.shoes);
  }
  // torso
  const ty = 11 - bob + 1;
  c.rect(4, ty, 8, 6, sh);
  c.px(4, ty, null);
  c.px(11, ty, null);
  c.vline(11, ty, 6, shS);
  c.hline(4, ty + 5, 8, shS);
  // collar and belt
  if (dir !== 'up') {
    c.px(6, ty, skS);
    c.px(9, ty, skS);
  }
  c.hline(4, ty + 5, 8, pa === N[3] ? N[1] : paS);
  c.px(7, ty + 5, RAMPS.coin[1]);
  // arms
  if (dir === 'down' || dir === 'up') {
    const swing = step;
    c.rect(3, ty + 1 + (swing > 0 ? 1 : 0), 1, 4, sh);
    c.rect(12, ty + 1 + (swing < 0 ? 1 : 0), 1, 4, shS);
    c.px(3, ty + 5 + (swing > 0 ? 1 : 0), sk);
    c.px(12, ty + 5 + (swing < 0 ? 1 : 0), skS);
  } else {
    const ax = dir === 'left' ? 7 + step : 8 - step;
    c.rect(ax, ty + 1, 2, 4, shS);
    c.px(ax, ty + 5, sk);
  }
  // head
  const hy = 3 - bob + 1;
  c.rect(4, hy, 8, 8, sk);
  c.vline(11, hy + 1, 7, skS);
  c.hline(5, hy + 7, 6, skS);
  // round the head
  for (const [x, y] of [
    [4, hy],
    [11, hy],
    [4, hy + 7],
    [11, hy + 7],
  ])
    c.px(x!, y!, null);
  c.rect(6, hy + 8, 4, 1, skS); // neck
  if (dir === 'down') {
    // two-pixel eyes with a tiny highlight, blush and a small smile
    for (const ex of [6, 9]) {
      c.px(ex, hy + 3, OUT);
      c.px(ex, hy + 4, OUT);
      c.px(ex, hy + 3, N[2]);
    }
    c.px(5, hy + 5, RAMPS.red[0]);
    c.px(10, hy + 5, RAMPS.red[0]);
    c.hline(7, hy + 6, 2, skS);
  } else if (dir === 'left') {
    c.px(5, hy + 3, N[2]);
    c.px(5, hy + 4, OUT);
    c.px(4, hy + 5, skS);
    c.px(6, hy + 6, skS);
  } else if (dir === 'right') {
    c.px(10, hy + 3, N[2]);
    c.px(10, hy + 4, OUT);
    c.px(11, hy + 5, skS);
    c.px(9, hy + 6, skS);
  }
  return { bob, hy };
}

/** Player's short messy hair, drawn standalone so it can be recolored. */
export function playerHair(c: Canvas, dir: Dir, hy: number, col: [string, string]) {
  const [h, hS] = col;
  c.rect(4, hy - 1, 8, 3, h);
  c.px(3, hy, h);
  c.px(12, hy, hS);
  c.hline(5, hy - 2, 6, h);
  c.px(7, hy - 3, h);
  if (dir === 'down') {
    c.px(4, hy + 2, h);
    c.px(11, hy + 2, hS);
    c.px(6, hy + 2, hS);
    c.px(9, hy + 2, h);
  } else if (dir === 'up') {
    c.rect(4, hy, 8, 6, h);
    c.hline(4, hy + 6, 8, hS);
  } else {
    const back = dir === 'left' ? 9 : 4;
    c.rect(back, hy, 3, 5, h);
    c.vline(dir === 'left' ? 11 : 4, hy, 5, hS);
    c.px(dir === 'left' ? 4 : 11, hy + 2, h);
  }
  c.hline(5, hy - 2, 3, hS === h ? h : col[0]);
}

export function drawHat(c: Canvas, hat: string, dir: Dir, hy: number) {
  const CY = RAMPS.cyan;
  const MG = RAMPS.magenta;
  const M = RAMPS.metal;
  const CO = RAMPS.coin;
  switch (hat) {
    case 'cap': {
      c.rect(4, hy - 2, 8, 3, CY[0]);
      c.hline(4, hy - 2, 8, CY[1]);
      if (dir === 'down') c.hline(3, hy + 1, 10, N[2]);
      if (dir === 'left') c.hline(2, hy + 1, 5, N[2]);
      if (dir === 'right') c.hline(9, hy + 1, 5, N[2]);
      // tiny fan
      c.px(7, hy - 4, M[3]);
      c.hline(6, hy - 5, 3, M[4]);
      break;
    }
    case 'beanie': {
      c.rect(4, hy - 2, 8, 4, MG[0]);
      c.hline(4, hy + 1, 8, MG[1]);
      for (let i = 4; i < 12; i += 2) c.px(i, hy - 1, MG[1]);
      c.rect(7, hy - 4, 2, 2, MG[1]);
      break;
    }
    case 'headset': {
      c.hline(4, hy - 2, 8, M[2]);
      c.px(3, hy - 1, M[2]);
      c.px(12, hy - 1, M[2]);
      if (dir !== 'right') c.rect(2, hy + 1, 2, 3, M[1]);
      if (dir !== 'left') c.rect(12, hy + 1, 2, 3, M[1]);
      if (dir !== 'right') c.px(2, hy + 2, CY[1]);
      if (dir !== 'left') c.px(13, hy + 2, CY[1]);
      break;
    }
    case 'straw': {
      c.hline(2, hy, 12, WD[3]);
      c.hline(2, hy + 1, 12, WD[2]);
      c.rect(5, hy - 3, 6, 3, WD[3]);
      c.hline(5, hy - 1, 6, RAMPS.red[0]);
      break;
    }
    case 'crown': {
      c.rect(5, hy - 2, 6, 2, CO[2]);
      for (const x of [5, 7, 9]) c.px(x, hy - 3, CO[2]);
      c.px(6, hy - 2, CY[1]);
      c.px(9, hy - 2, MG[1]);
      break;
    }
  }
}

function frameCanvas(look: Look, dir: Dir, frame: number, withHairOnly = false): Canvas {
  const c = new Canvas(CW, CH);
  const { bob } = body(c, look, dir, frame);
  look.hair?.(c, dir, bob);
  look.extra?.(c, dir, bob, frame);
  if (withHairOnly) return c;
  c.outline(OUT);
  return c;
}

function sheetFor(draw: (dir: Dir, frame: number) => Canvas): Canvas {
  const s = new Canvas(CW * 4, CH * 4);
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < 4; f++) s.blit(draw(dir, f === 2 ? 0 : f === 3 ? 2 : f), f * CW, row * CH);
  });
  return s;
}

const PLAYER_LOOK: Look = {
  skin: [WD[3], WD[2]],
  shirt: [RAMPS.water[3], RAMPS.water[2]],
  pants: [N[3], N[2]],
  shoes: N[1],
};

/**
 * Player layers. Frame order per row: idle, step A, idle, step B.
 * The body includes an outline. Hair/hat layers are outlined separately.
 */
export function buildPlayerSheets(): {
  body: Canvas;
  hair: Record<string, Canvas>;
  hats: Record<string, Canvas>;
} {
  const bodySheet = sheetFor((dir, f) => frameCanvas(PLAYER_LOOK, dir, f));
  const hair: Record<string, Canvas> = {};
  for (const hc of HAIR_COLORS) {
    hair[hc.id] = sheetFor((dir, f) => {
      const c = new Canvas(CW, CH);
      const bob = f === 1 || f === 2 ? 1 : 0;
      playerHair(c, dir, 4 - bob, HAIR_SHADES[hc.id]!);
      c.outline(OUT);
      // keep only the outline that sits above/around the hair, not over the face
      return c;
    });
  }
  const hats: Record<string, Canvas> = {};
  for (const hat of ['cap', 'beanie', 'headset', 'straw', 'crown']) {
    hats[hat] = sheetFor((dir, f) => {
      const c = new Canvas(CW, CH);
      const bob = f === 1 || f === 2 ? 1 : 0;
      drawHat(c, hat, dir, 4 - bob);
      c.outline(OUT);
      return c;
    });
  }
  return { body: bodySheet, hair, hats };
}

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------
const NPC_LOOKS: Record<string, Look> = {
  mia: {
    skin: [WD[3], WD[2]],
    shirt: [RAMPS.red[0], WD[1]],
    pants: [N[2], N[1]],
    shoes: N[0],
    hair: (c, dir, bob) => {
      const hy = 4 - bob;
      const h = N[2];
      c.rect(3, hy - 2, 10, 3, h);
      if (dir === 'up') c.rect(3, hy, 10, 7, h);
      else if (dir === 'down') {
        c.rect(3, hy, 2, 6, h);
        c.rect(11, hy, 2, 6, h);
        c.hline(4, hy + 1, 8, h);
      } else c.rect(dir === 'left' ? 8 : 3, hy, 5, 7, h);
    },
    extra: (c, dir, bob) => {
      // apron
      if (dir !== 'up') c.rect(5, 13 - bob, 6, 5, WD[1]);
    },
  },
  bo: {
    skin: [WD[2], WD[1]],
    shirt: [WA[2], WA[1]],
    pants: [RAMPS.grass[2], RAMPS.grass[1]],
    shoes: N[1],
    hair: (c, _dir, bob) => {
      const hy = 4 - bob;
      for (let i = 0; i < 5; i++) c.circle(5 + i * 1.5, hy - 1 + (i % 2), 1, WD[3]);
      c.hline(4, hy, 8, WD[3]);
    },
    extra: (c, dir, bob) => {
      if (dir !== 'up') c.rect(5, 13 - bob, 6, 5, RAMPS.green[0]);
    },
  },
  dex: {
    skin: [WD[3], WD[2]],
    shirt: [RAMPS.water[2], RAMPS.water[1]],
    pants: [RAMPS.water[2], RAMPS.water[1]],
    shoes: N[0],
    hair: (c, dir, bob) => {
      const hy = 4 - bob;
      c.rect(4, hy - 1, 8, 2, RAMPS.stone[3]);
      if (dir === 'down') {
        c.rect(5, hy + 5, 6, 3, RAMPS.stone[3]); // beard
        c.hline(6, hy + 6, 4, RAMPS.stone[4]);
      }
      if (dir === 'up') c.rect(4, hy - 1, 8, 6, RAMPS.stone[3]);
    },
    extra: (c, dir, bob) => {
      // cap
      c.rect(4, 2 - bob, 8, 2, RAMPS.red[0]);
      if (dir === 'down') c.hline(4, 4 - bob, 8, RAMPS.red[0]);
    },
  },
  vera: {
    skin: [WD[2], WD[1]],
    shirt: [N[3], N[2]],
    pants: [N[2], N[1]],
    shoes: N[0],
    hair: (c, dir, bob) => {
      const hy = 4 - bob;
      c.rect(4, hy - 1, 8, 2, WD[1]);
      if (dir === 'up') c.rect(4, hy, 8, 9, WD[1]);
      if (dir === 'left' || dir === 'right') c.rect(dir === 'left' ? 10 : 4, hy + 1, 2, 8, WD[1]);
    },
    extra: (c, dir, bob) => {
      // hi-vis vest + hard hat
      c.rect(4, 12 - bob, 8, 5, RAMPS.yellow[1]);
      if (dir !== 'up') c.rect(7, 12 - bob, 2, 5, N[3]);
      c.hline(4, 14 - bob, 8, RAMPS.metal[4]);
      c.rect(4, 1 - bob, 8, 3, RAMPS.yellow[1]);
      c.hline(3, 3 - bob, 10, RAMPS.yellow[0]);
    },
  },
  kai: {
    skin: [WD[3], WD[2]],
    shirt: [RAMPS.magenta[0], N[3]],
    pants: [N[1], N[0]],
    shoes: RAMPS.metal[4],
    hair: (c, dir, bob) => {
      const hy = 4 - bob;
      const h = RAMPS.cyan[1];
      c.rect(4, hy - 1, 8, 2, h);
      for (const x of [4, 6, 8, 10]) c.px(x, hy - 2 - (x % 4 === 0 ? 1 : 0), h);
      if (dir === 'up') c.rect(4, hy, 8, 5, RAMPS.cyan[0]);
    },
    extra: (c, dir, bob) => {
      if (dir === 'down') c.hline(5, 8 - bob, 6, N[0]); // sunglasses
      if (dir === 'left') c.hline(4, 8 - bob, 3, N[0]);
      if (dir === 'right') c.hline(9, 8 - bob, 3, N[0]);
    },
  },
};

export function buildNpcSheets(): Record<string, Canvas> {
  const out: Record<string, Canvas> = {};
  for (const [id, look] of Object.entries(NPC_LOOKS))
    out[id] = sheetFor((dir, f) => frameCanvas(look, dir, f));
  return out;
}

// ---------------------------------------------------------------------------
// Portraits (32×32) for dialogue boxes
// ---------------------------------------------------------------------------
export function buildPortraits(): Canvas {
  const ids = ['mia', 'bo', 'dex', 'vera', 'kai', 'ray', 'board', 'player'];
  const s = new Canvas(32 * ids.length, 32);
  ids.forEach((id, i) => {
    const c = new Canvas(32, 32);
    c.rect(0, 0, 32, 32, N[1]);
    c.dither(0, 0, 32, 32, N[2], (x, y) => Math.max(0, 0.6 - Math.hypot(x - 10, y - 8) / 26));
    if (id === 'board') {
      c.rect(6, 8, 20, 16, WD[2]);
      c.box(6, 8, 20, 16, WD[0]);
      c.rect(9, 11, 6, 5, WA[2]);
      c.rect(17, 12, 6, 7, WA[1]);
      c.px(12, 11, RAMPS.red[1]);
      c.px(20, 12, RAMPS.cyan[1]);
      c.vline(15, 24, 6, WD[1]);
      s.blit(c, i * 32, 0);
      return;
    }
    const look =
      id === 'player' ? { ...PLAYER_LOOK, hair: undefined } : id === 'ray' ? null : NPC_LOOKS[id]!;
    if (!look) {
      // Uncle Ray: an envelope with a paw print
      c.rect(5, 9, 22, 15, WA[2]);
      c.line(5, 9, 16, 18, WA[0]);
      c.line(26, 9, 16, 18, WA[0]);
      c.box(5, 9, 22, 15, WD[1]);
      c.circle(16, 20, 2, RAMPS.red[0]);
      s.blit(c, i * 32, 0);
      return;
    }
    // Scale a front-facing sprite 2× into the portrait (head and shoulders).
    const f = frameCanvas(look, 'down', 0);
    if (id === 'player') playerHair(f, 'down', 4, HAIR_SHADES.copper!);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const col = f.get(x, y);
        if (!col) continue;
        c.rect(x * 2, y * 2 + 3, 2, 2, col);
      }
    c.box(0, 0, 32, 32, N[3]);
    s.blit(c, i * 32, 0);
  });
  return s;
}

export const PORTRAIT_IDS = ['mia', 'bo', 'dex', 'vera', 'kai', 'ray', 'board', 'player'];
