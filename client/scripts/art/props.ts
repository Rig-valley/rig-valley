/** Buildings, nature and props. Man-made objects get the dark outline; nature uses its own dark ramp end. */
import { RAMPS } from '@rig-valley/shared';
import { Canvas, bayer, rng } from './canvas.js';

const N = RAMPS.night;
const G = RAMPS.grass;
const WD = RAMPS.wood;
const WA = RAMPS.warm;
const S = RAMPS.stone;
const M = RAMPS.metal;
const W = RAMPS.water;
const CY = RAMPS.cyan;
const MG = RAMPS.magenta;
const YE = RAMPS.yellow;
const RD = RAMPS.red;
const GR = RAMPS.green;
const CO = RAMPS.coin;
const SO = RAMPS.soil;
const OUT = N[0];

type Ramp4 = readonly [string, string, string, string];

function roof(c: Canvas, x: number, y: number, w: number, h: number, ramp: Ramp4) {
  c.rect(x, y, w, h, ramp[1]);
  // shingles
  for (let j = 0; j < h; j += 3) {
    c.hline(x, y + j, w, ramp[0]);
    for (let i = (j / 3) % 2 === 0 ? 0 : 2; i < w; i += 4) c.px(x + i, y + j + 1, ramp[2]);
  }
  c.hline(x, y, w, ramp[3]);
  c.hline(x, y + h - 1, w, ramp[0]);
  c.hline(x - 1, y + h, w + 2, N[0]);
}

function warmWindow(c: Canvas, x: number, y: number, w: number, h: number) {
  c.rect(x, y, w, h, WA[0]);
  c.dither(x, y, w, h, WA[1], (i, j) => Math.max(0, 0.9 - (i + j) / (w + h)));
  c.dither(x, y, w, h, WA[2], (i, j) => (i + j < 3 ? 0.8 : 0));
  c.box(x - 1, y - 1, w + 2, h + 2, WD[0]);
  c.vline(x + Math.floor(w / 2), y, h, WD[1]);
}

function wall(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  shade: string,
  light: string,
) {
  c.rect(x, y, w, h, base);
  for (let j = 2; j < h; j += 4) c.hline(x, y + j, w, shade);
  c.vline(x, y, h, light);
  c.dither(x, y + h - 4, w, 4, shade, 0.5);
}

function door(c: Canvas, x: number, y: number, w: number, h: number, col: string) {
  c.rect(x, y, w, h, col);
  c.box(x, y, w, h, WD[0]);
  c.px(x + w - 3, y + Math.floor(h / 2), CO[2]);
  c.rect(x + 1, y + h, w - 2, 1, S[3]);
}

/** Generic shop. */
function shop(opts: {
  roof: Ramp4;
  wall: [string, string, string];
  accent: string;
  sign: (c: Canvas, x: number, y: number) => void;
  awning?: [string, string];
}): Canvas {
  const c = new Canvas(80, 72);
  const roofY = 4;
  const roofH = 22;
  wall(c, 4, roofY + roofH, 72, 40, ...opts.wall);
  roof(c, 2, roofY, 76, roofH, opts.roof);
  // chimney
  c.rect(60, 0, 6, 8, S[2]);
  c.hline(60, 0, 6, S[3]);
  // windows
  warmWindow(c, 10, roofY + roofH + 10, 14, 10);
  warmWindow(c, 56, roofY + roofH + 10, 14, 10);
  // door
  door(c, 34, roofY + roofH + 16, 12, 20, opts.wall[1]);
  c.rect(36, roofY + roofH + 18, 8, 6, WA[1]);
  // awning
  if (opts.awning) {
    for (let i = 0; i < 72; i++)
      c.vline(4 + i, roofY + roofH, 5, Math.floor(i / 4) % 2 ? opts.awning[0] : opts.awning[1]);
    for (let i = 0; i < 72; i += 4) c.px(5 + i, roofY + roofH + 5, opts.awning[1]);
  }
  // neon sign board
  c.rect(28, roofY + roofH + 4, 24, 9, N[1]);
  c.box(28, roofY + roofH + 4, 24, 9, opts.accent);
  opts.sign(c, 40, roofY + roofH + 8);
  c.outline(OUT);
  return c;
}

export function buildBuildings(): Record<string, Canvas> {
  const out: Record<string, Canvas> = {};

  out.hardware = shop({
    roof: [W[0], W[1], W[2], W[3]],
    wall: [S[2], S[1], S[3]],
    accent: CY[1],
    sign: (c, x, y) => {
      // gear/chip glyph
      c.box(x - 3, y - 2, 6, 5, CY[1]);
      c.px(x - 1, y, CY[1]);
      c.px(x, y, CY[1]);
      for (const dx of [-2, 0, 2]) {
        c.px(x + dx, y - 3, CY[0]);
        c.px(x + dx, y + 3, CY[0]);
      }
    },
  });
  out.cafe = shop({
    roof: [WD[0], WD[1], WD[2], WD[3]],
    wall: [SO[2], SO[1], SO[3]],
    accent: MG[1],
    awning: [MG[0], WA[2]],
    sign: (c, x, y) => {
      c.rect(x - 3, y - 1, 5, 4, MG[1]);
      c.px(x + 2, y, MG[1]);
      c.px(x - 2, y - 3, WA[2]);
      c.px(x, y - 3, WA[2]);
    },
  });
  out.repair = shop({
    roof: [G[0], G[1], G[2], G[3]],
    wall: [M[1], M[0], M[2]],
    accent: GR[1],
    sign: (c, x, y) => {
      c.line(x - 3, y + 2, x + 2, y - 3, GR[1]);
      c.px(x + 2, y - 2, GR[1]);
      c.px(x + 1, y - 3, GR[1]);
      c.px(x - 3, y + 3, GR[1]);
    },
  });

  // --- Garage (player home) ---
  {
    const c = new Canvas(112, 84);
    wall(c, 4, 28, 104, 52, M[1], M[0], M[2]);
    roof(c, 2, 4, 108, 24, [N[1], N[2], N[3], N[4]]);
    // roof vents
    c.rect(20, 8, 8, 5, M[2]);
    c.rect(84, 2, 3, 6, M[3]);
    c.circle(85, 2, 2, M[2]);
    // roll-up door
    c.rect(36, 44, 40, 34, M[2]);
    for (let j = 46; j < 78; j += 3) c.hline(36, j, 40, M[1]);
    c.hline(36, 44, 40, M[3]);
    c.box(35, 43, 42, 36, OUT);
    c.dither(36, 70, 40, 8, CY[0], (i, j) => (bayer(i, j) < 0.15 ? 1 : 0)); // rig glow leaking under the door
    // neon RIG sign (magenta)
    c.rect(44, 32, 24, 9, N[0]);
    const R = MG[1];
    // R
    c.vline(47, 34, 5, R);
    c.hline(48, 34, 2, R);
    c.px(50, 35, R);
    c.hline(48, 36, 2, R);
    c.px(49, 37, R);
    c.px(50, 38, R);
    // I
    c.vline(54, 34, 5, R);
    // G
    c.vline(58, 35, 3, R);
    c.hline(59, 34, 3, R);
    c.hline(59, 38, 3, R);
    c.px(61, 37, R);
    c.px(60, 36, R);
    c.px(61, 36, R);
    c.box(44, 32, 24, 9, MG[0]);
    // warm window
    warmWindow(c, 86, 46, 16, 14);
    // AC unit
    c.rect(10, 50, 14, 12, M[3]);
    c.box(10, 50, 14, 12, M[1]);
    c.circle(17, 56, 4, M[1]);
    c.circle(17, 56, 2, M[2]);
    // crates
    c.rect(12, 68, 10, 10, WD[2]);
    c.box(12, 68, 10, 10, WD[0]);
    c.line(12, 68, 21, 77, WD[1]);
    c.outline(OUT);
    out.garage = c;
  }

  // --- Power Substation ---
  {
    const c = new Canvas(112, 72);
    c.rect(4, 14, 104, 54, M[0]);
    c.dither(4, 14, 104, 54, M[1], 0.3);
    // transformers
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * 32;
      c.rect(x, 22, 22, 26, M[2]);
      c.vline(x, 22, 26, M[3]);
      for (let j = 26; j < 46; j += 3) c.hline(x + 3, j, 16, M[1]);
      c.rect(x + 4, 14, 3, 8, M[3]);
      c.rect(x + 15, 14, 3, 8, M[3]);
      c.px(x + 5, 13, CY[1]);
      c.px(x + 16, 13, CY[1]);
      // hazard stripes
      for (let k = 0; k < 22; k++) c.px(x + k, 48, k % 4 < 2 ? YE[1] : N[0]);
    }
    // fence
    for (let x = 2; x < 110; x += 4) c.vline(x, 8, 62, S[3]);
    c.hline(2, 8, 108, S[4]);
    c.hline(2, 69, 108, S[2]);
    // gate + warning sign
    c.rect(48, 52, 16, 18, N[1]);
    c.rect(52, 55, 8, 7, YE[1]);
    c.px(56, 57, N[0]);
    c.px(56, 58, N[0]);
    c.px(56, 60, N[0]);
    c.outline(OUT);
    out.substation = c;
  }

  // --- Warehouse by the river ---
  {
    const c = new Canvas(128, 80);
    wall(c, 4, 26, 120, 50, S[2], S[1], S[3]);
    c.rect(2, 4, 124, 22, M[1]);
    for (let i = 0; i < 124; i += 3) c.vline(2 + i, 4, 22, M[0]);
    c.hline(2, 4, 124, M[3]);
    c.hline(1, 26, 126, OUT);
    // solar panels (stage 3 unlock look)
    for (let i = 0; i < 5; i++) {
      c.rect(10 + i * 22, 7, 18, 12, W[1]);
      c.box(10 + i * 22, 7, 18, 12, M[2]);
      c.vline(19 + i * 22, 7, 12, M[2]);
      c.px(12 + i * 22, 9, W[3]);
    }
    // big doors
    for (const x of [16, 72]) {
      c.rect(x, 44, 36, 32, WD[1]);
      for (let i = 0; i < 36; i += 6) c.vline(x + i, 44, 32, WD[0]);
      c.line(x, 44, x + 35, 75, WD[2]);
      c.line(x + 35, 44, x, 75, WD[2]);
      c.box(x, 44, 36, 32, OUT);
    }
    c.rect(56, 30, 16, 8, N[0]);
    c.box(56, 30, 16, 8, CY[0]);
    c.hline(59, 34, 10, CY[1]);
    c.outline(OUT);
    out.warehouse = c;
  }

  // --- Data center on the hill ---
  {
    const c = new Canvas(144, 88);
    c.rect(4, 12, 136, 72, N[2]);
    c.vline(4, 12, 72, N[3]);
    c.hline(4, 12, 136, N[4]);
    c.rect(2, 4, 140, 9, N[1]);
    c.hline(2, 4, 140, N[3]);
    // server light bands
    for (let row = 0; row < 3; row++) {
      const y = 22 + row * 14;
      c.rect(10, y, 124, 8, N[0]);
      for (let i = 0; i < 124; i += 2) {
        const col =
          (i * 7 + row * 3) % 11 === 0
            ? MG[1]
            : (i * 5 + row) % 7 === 0
              ? CY[1]
              : i % 6 === 0
                ? GR[0]
                : null;
        if (col) c.px(10 + i, y + 2 + (i % 4 === 0 ? 2 : 0), col);
      }
      c.hline(10, y + 7, 124, CY[0]);
    }
    // entrance
    c.rect(62, 62, 20, 22, N[0]);
    c.box(62, 62, 20, 22, CY[0]);
    c.rect(64, 64, 16, 4, CY[0]);
    // cooling fans on roof
    for (let i = 0; i < 4; i++) {
      c.circle(24 + i * 32, 8, 3, M[2]);
      c.px(24 + i * 32, 8, M[4]);
    }
    c.outline(OUT);
    out.datacenter = c;
  }

  return out;
}

export function buildProps(): Record<string, Canvas> {
  const out: Record<string, Canvas> = {};

  // Big round tree 32×40 (nature: dark end of its own ramp, no black outline)
  for (const [name, seed] of [
    ['tree', 1],
    ['tree2', 2],
  ] as const) {
    const c = new Canvas(32, 40);
    const r = rng(seed);
    c.rect(14, 26, 4, 12, WD[1]);
    c.vline(14, 26, 12, WD[2]);
    c.ellipse(16, 38, 9, 2, G[0]);
    const blobs = [
      [16, 14, 11],
      [9, 18, 7],
      [23, 18, 7],
      [16, 22, 9],
      [12, 9, 6],
      [21, 9, 6],
    ] as const;
    for (const [x, y, rr] of blobs) c.circle(x, y, rr, G[1]);
    for (const [x, y, rr] of blobs) c.circle(x - 1, y - 1, rr - 2, G[2]);
    c.dither(0, 0, 32, 30, G[3], (x, y) => Math.max(0, 0.6 - Math.hypot(x - 11, y - 8) / 12));
    for (let i = 0; i < 10; i++) c.px(6 + r() * 20, 6 + r() * 16, G[4]);
    // outline in nature's darkest
    const ol = c.clone();
    ol.outline(G[0]);
    c.blit(ol, 0, 0);
    out[name] = c;
  }
  // Pine 24×40
  {
    const c = new Canvas(24, 40);
    c.rect(11, 32, 3, 6, WD[1]);
    for (let k = 0; k < 4; k++) {
      const y = 4 + k * 7;
      const w = 4 + k * 3;
      for (let j = 0; j < 9; j++) {
        const ww = Math.floor((w * j) / 9);
        c.hline(12 - ww, y + j, ww * 2 + 1, j < 3 ? G[2] : G[1]);
        c.px(12 - ww, y + j, G[3]);
      }
    }
    c.outline(G[0]);
    out.pine = c;
  }
  // Bush 16×14
  {
    const c = new Canvas(16, 14);
    c.circle(5, 8, 4, G[1]);
    c.circle(10, 8, 5, G[1]);
    c.circle(7, 6, 4, G[2]);
    c.dither(0, 0, 16, 14, G[3], (x, y) => (x < 9 && y < 7 ? 0.35 : 0));
    c.px(4, 6, MG[1]);
    c.outline(G[0]);
    out.bush = c;
  }
  // Lamp post 16×36
  {
    const c = new Canvas(16, 36);
    c.rect(7, 8, 2, 26, M[1]);
    c.vline(7, 8, 26, M[2]);
    c.rect(5, 33, 6, 2, M[0]);
    c.rect(4, 2, 8, 6, M[1]);
    c.rect(5, 4, 6, 3, WA[1]);
    c.hline(5, 4, 6, WA[2]);
    c.hline(3, 2, 10, M[2]);
    c.outline(OUT);
    out.lamp = c;
  }
  // Bench 24×16
  {
    const c = new Canvas(24, 16);
    c.rect(1, 4, 22, 3, WD[2]);
    c.hline(1, 4, 22, WD[3]);
    c.rect(1, 9, 22, 3, WD[2]);
    c.hline(1, 9, 22, WD[3]);
    for (const x of [3, 19]) c.rect(x, 12, 2, 3, M[1]);
    c.outline(OUT);
    out.bench = c;
  }
  // Statue pedestal 32×28 (hologram coin floats above, separate sprite)
  {
    const c = new Canvas(32, 28);
    c.rect(6, 12, 20, 14, S[2]);
    c.vline(6, 12, 14, S[3]);
    c.hline(4, 10, 24, S[3]);
    c.rect(4, 10, 24, 3, S[3]);
    c.hline(4, 10, 24, S[4]);
    c.rect(10, 16, 12, 6, S[1]);
    c.hline(11, 18, 10, CY[0]);
    c.rect(3, 25, 26, 2, S[1]);
    c.dither(8, 0, 16, 10, CY[0], (x, y) =>
      bayer(x, y) < 0.18 && Math.abs(x - 8) < 7 - y * 0.4 ? 1 : 0,
    );
    c.outline(OUT);
    out.statue = c;
  }
  // Hologram coin 20×20, 4 frames → 80×20
  {
    const s = new Canvas(80, 20);
    [8, 6, 2, 6].forEach((rx, f) => {
      const c = new Canvas(20, 20);
      c.ellipse(10, 10, rx, 8, CY[0]);
      if (rx > 3) c.ellipse(10, 10, rx - 2, 6, N[0]);
      if (rx > 3) {
        c.vline(10, 6, 9, CY[1]);
        c.hline(9, 7, 3, CY[1]);
        c.hline(9, 13, 3, CY[1]);
      }
      c.dither(0, 0, 20, 20, CY[1], (x, y) =>
        Math.abs(y - 10) < 8 && Math.abs(x - 10) <= rx && (y + f) % 3 === 0 ? 0.6 : 0,
      );
      s.blit(c, f * 20, 0);
    });
    out.holocoin = s;
  }
  // Market board 32×32
  {
    const c = new Canvas(32, 32);
    c.rect(4, 22, 2, 9, WD[1]);
    c.rect(26, 22, 2, 9, WD[1]);
    c.rect(2, 4, 28, 20, WD[2]);
    c.box(2, 4, 28, 20, WD[0]);
    c.hline(2, 4, 28, WD[3]);
    c.rect(1, 2, 30, 3, WD[1]);
    const notes = [
      [5, 8, WA[2]],
      [13, 7, CY[0]],
      [21, 9, WA[1]],
      [6, 15, MG[0]],
      [15, 15, WA[2]],
      [22, 16, GR[0]],
    ] as const;
    for (const [x, y, col] of notes) {
      c.rect(x, y, 6, 5, col);
      c.hline(x + 1, y + 2, 4, N[2]);
      c.px(x + 2, y, RD[1]);
    }
    c.outline(OUT);
    out.board = c;
  }
  // Mailbox 16×20
  {
    const c = new Canvas(16, 20);
    c.rect(7, 10, 2, 9, WD[1]);
    c.rect(3, 4, 10, 7, W[2]);
    c.hline(3, 4, 10, W[3]);
    c.rect(4, 3, 8, 1, W[3]);
    c.rect(12, 2, 1, 5, RD[1]);
    c.rect(13, 2, 2, 2, RD[1]);
    c.outline(OUT);
    out.mailbox = c;
    const flagDown = c.clone();
    flagDown.rect(12, 2, 3, 5, null);
    flagDown.rect(12, 6, 3, 1, RD[0]);
    out.mailbox_empty = flagDown;
  }
  // Inherited box 16×14
  {
    const c = new Canvas(16, 14);
    c.rect(1, 4, 14, 9, WD[2]);
    c.rect(1, 2, 14, 3, WD[3]);
    c.vline(8, 2, 11, WA[1]);
    c.hline(1, 8, 14, WD[1]);
    c.px(4, 6, WD[1]);
    c.outline(OUT);
    out.box = c;
    const open = new Canvas(16, 14);
    open.rect(1, 5, 14, 8, WD[2]);
    open.rect(2, 6, 12, 3, WD[0]);
    open.line(1, 5, 0, 1, WD[3]);
    open.line(14, 5, 15, 1, WD[3]);
    open.outline(OUT);
    out.box_open = open;
  }
  // Gate sign 16×22
  {
    const c = new Canvas(16, 22);
    c.rect(7, 10, 2, 11, WD[1]);
    c.rect(1, 2, 14, 9, WD[2]);
    c.hline(1, 2, 14, WD[3]);
    c.hline(3, 5, 10, WD[0]);
    c.hline(3, 7, 7, WD[0]);
    c.px(12, 7, YE[1]);
    c.outline(OUT);
    out.sign = c;
  }
  // Festival stand 32×36
  {
    const c = new Canvas(32, 36);
    c.rect(4, 18, 24, 14, WD[2]);
    c.hline(4, 18, 24, WD[3]);
    c.rect(6, 20, 20, 4, WA[2]);
    for (let i = 0; i < 28; i++)
      c.vline(
        2 + i,
        6 + Math.floor(Math.abs(14 - i) / 4),
        10 - Math.floor(Math.abs(14 - i) / 4),
        Math.floor(i / 4) % 2 ? MG[0] : WA[2],
      );
    c.rect(4, 16, 2, 16, WD[1]);
    c.rect(26, 16, 2, 16, WD[1]);
    for (let i = 0; i < 6; i++) c.px(5 + i * 4, 17, i % 2 ? CY[1] : YE[1]);
    c.outline(OUT);
    out.stand = c;
  }
  // Breaker panel / door marker on garage for sleeping: a door mat 16×8
  {
    const c = new Canvas(16, 8);
    c.rect(1, 1, 14, 6, WD[1]);
    c.dither(1, 1, 14, 6, WD[2], 0.4);
    c.outline(OUT);
    out.mat = c;
  }
  // Rock 12×10
  {
    const c = new Canvas(12, 10);
    c.ellipse(6, 6, 5, 3, S[2]);
    c.ellipse(5, 5, 3, 2, S[3]);
    c.px(4, 4, S[4]);
    c.outline(S[0]);
    out.rock = c;
  }
  // Lily pad / reeds for pond 12×10
  {
    const c = new Canvas(12, 10);
    c.ellipse(5, 6, 4, 2, G[2]);
    c.px(6, 5, G[4]);
    c.vline(10, 1, 7, G[3]);
    c.px(10, 0, WD[2]);
    c.outline(G[0]);
    out.reeds = c;
  }
  return out;
}

/** Decorations placed on field slots, 16×24 each, in item order. */
export const DECOR_ORDER = [
  'decor_lamp',
  'decor_fern',
  'decor_gnome',
  'decor_ribbon',
  'decor_fountain',
  'decor_lantern',
  'decor_glowtree',
  'decor_trophy',
];

export function buildDecorSheet(): Canvas {
  const s = new Canvas(16 * DECOR_ORDER.length, 24);
  const draw: Record<string, (c: Canvas) => void> = {
    decor_lamp: (c) => {
      c.rect(7, 8, 2, 14, M[1]);
      c.rect(5, 21, 6, 2, M[0]);
      c.rect(4, 2, 8, 6, MG[0]);
      c.rect(5, 3, 6, 4, MG[1]);
      c.hline(5, 3, 6, WA[2]);
    },
    decor_fern: (c) => {
      c.rect(4, 16, 8, 7, WD[2]);
      c.hline(4, 16, 8, WD[3]);
      for (const [x0, x1] of [
        [8, 2],
        [8, 14],
        [8, 4],
        [8, 12],
        [8, 8],
      ])
        c.line(x0!, 16, x1!, 6 + Math.abs(x1! - 8), G[3]);
      c.px(2, 8, G[4]);
      c.px(14, 8, G[4]);
    },
    decor_gnome: (c) => {
      c.rect(5, 14, 6, 8, W[2]);
      c.circle(8, 12, 3, WD[3]);
      c.rect(5, 13, 6, 3, M[4]);
      for (let j = 0; j < 7; j++)
        c.hline(8 - Math.floor(j / 2), 3 + j, Math.floor(j / 2) * 2 + 1, RD[0]);
      c.px(8, 2, GR[1]);
    },
    decor_ribbon: (c) => {
      c.rect(7, 12, 2, 10, WD[1]);
      c.circle(8, 8, 5, GR[0]);
      c.circle(8, 8, 3, GR[1]);
      c.px(8, 8, WA[2]);
      c.line(6, 12, 4, 17, GR[0]);
      c.line(10, 12, 12, 17, GR[0]);
    },
    decor_fountain: (c) => {
      c.rect(2, 16, 12, 6, S[2]);
      c.hline(2, 16, 12, S[4]);
      c.rect(3, 17, 10, 2, W[2]);
      c.rect(7, 8, 2, 8, S[3]);
      c.dither(3, 2, 10, 8, CY[1], (x, y) => (Math.abs(x - 5) <= y * 0.6 ? 0.5 : 0));
    },
    decor_lantern: (c) => {
      c.rect(7, 4, 2, 2, WD[0]);
      c.ellipse(8, 12, 5, 6, WA[0]);
      c.ellipse(7, 11, 3, 4, WA[1]);
      c.px(6, 9, WA[2]);
      c.hline(5, 18, 6, WD[1]);
      c.rect(7, 19, 2, 3, WD[1]);
    },
    decor_glowtree: (c) => {
      for (let j = 0; j < 16; j++)
        c.hline(8 - Math.floor(j / 2.5), 3 + j, Math.floor(j / 2.5) * 2 + 1, G[1]);
      c.rect(7, 19, 2, 3, WD[1]);
      for (const [x, y, col] of [
        [8, 5, YE[1]],
        [6, 9, CY[1]],
        [10, 11, MG[1]],
        [5, 15, GR[1]],
        [11, 16, CY[1]],
        [8, 13, YE[1]],
      ] as const)
        c.px(x, y, col);
      c.px(8, 2, CO[3]);
    },
    decor_trophy: (c) => {
      c.rect(4, 4, 8, 7, CO[2]);
      c.vline(4, 4, 7, CO[3]);
      c.px(3, 5, CO[1]);
      c.px(12, 5, CO[1]);
      c.rect(7, 11, 2, 5, CO[1]);
      c.rect(4, 16, 8, 4, WD[1]);
      c.hline(4, 16, 8, WD[2]);
    },
  };
  DECOR_ORDER.forEach((id, i) => {
    const c = new Canvas(16, 24);
    draw[id]!(c);
    c.outline(OUT);
    s.blit(c, i * 16, 0);
  });
  return s;
}

/** Extra props that make the valley feel lived-in. */
export function buildExtraProps(): Record<string, Canvas> {
  const out: Record<string, Canvas> = {};

  // Small homes 64×60 in two color schemes
  const home = (roofRamp: Ramp4, wallCols: [string, string, string], seed: number) => {
    const c = new Canvas(64, 60);
    const r = rng(seed);
    wall(c, 4, 24, 56, 32, ...wallCols);
    roof(c, 2, 4, 60, 20, roofRamp);
    c.rect(44, 0, 6, 8, S[2]);
    c.hline(44, 0, 6, S[3]);
    warmWindow(c, 10, 32, 10, 9);
    if (r() < 0.7) warmWindow(c, 44, 32, 10, 9);
    else {
      c.rect(44, 32, 10, 9, N[1]);
      c.box(43, 31, 12, 11, WD[0]);
    }
    door(c, 26, 38, 10, 17, WD[1]);
    c.rect(24, 55, 14, 1, S[3]);
    // flower box
    c.rect(9, 42, 12, 3, WD[1]);
    c.px(11, 41, MG[1]);
    c.px(14, 41, WA[1]);
    c.px(18, 41, CY[1]);
    c.outline(OUT);
    return c;
  };
  out.house1 = home([N[1], N[2], N[3], N[4]], [WD[2], WD[1], WD[3]], 1);
  out.house2 = home([G[0], G[1], G[2], G[3]], [S[2], S[1], S[3]], 2);
  out.house3 = home([RD[0], WD[1], WD[2], WD[3]], [M[1], M[0], M[2]], 3);

  // Power pole 16×48 (wires are drawn in-game between poles)
  {
    const c = new Canvas(16, 48);
    c.rect(7, 4, 2, 43, WD[1]);
    c.vline(7, 4, 43, WD[2]);
    c.rect(1, 6, 14, 2, WD[1]);
    c.hline(1, 6, 14, WD[2]);
    for (const x of [2, 7, 12]) c.rect(x, 4, 2, 2, M[3]);
    c.rect(9, 12, 4, 5, M[2]);
    c.px(10, 13, YE[1]);
    c.outline(OUT);
    out.pole = c;
  }

  // Signpost 24×28 with two arrows
  {
    const c = new Canvas(24, 28);
    c.rect(11, 8, 2, 19, WD[1]);
    c.vline(11, 8, 19, WD[2]);
    c.rect(4, 4, 16, 5, WD[2]);
    c.hline(4, 4, 16, WD[3]);
    for (let i = 0; i < 3; i++) c.vline(20 + i, 5 + i, 3 - i * 1, WD[2]);
    c.rect(3, 11, 16, 5, WD[2]);
    c.hline(3, 11, 16, WD[3]);
    for (let i = 0; i < 3; i++) c.vline(2 - i, 12 + i, 3 - i * 1, WD[2]);
    c.hline(7, 6, 9, WD[0]);
    c.hline(6, 13, 9, WD[0]);
    c.outline(OUT);
    out.signpost = c;
  }

  // Crates 20×18
  {
    const c = new Canvas(20, 18);
    c.rect(1, 5, 12, 12, WD[2]);
    c.box(1, 5, 12, 12, WD[1]);
    c.line(1, 5, 12, 16, WD[1]);
    c.hline(1, 5, 12, WD[3]);
    c.rect(10, 1, 9, 9, WD[3]);
    c.box(10, 1, 9, 9, WD[1]);
    c.line(10, 1, 18, 9, WD[2]);
    c.outline(OUT);
    out.crates = c;
  }

  // Barrel 12×16
  {
    const c = new Canvas(12, 16);
    c.rect(1, 2, 10, 13, WD[2]);
    c.vline(1, 2, 13, WD[3]);
    c.vline(10, 2, 13, WD[1]);
    for (const y of [4, 11]) c.hline(1, y, 10, M[2]);
    c.ellipse(6, 2, 4, 1, WD[3]);
    c.outline(OUT);
    out.barrel = c;
  }

  // Flower bed 32×14
  {
    const c = new Canvas(32, 14);
    c.rect(1, 6, 30, 7, WD[1]);
    c.hline(1, 6, 30, WD[2]);
    c.rect(2, 7, 28, 3, SO[1]);
    const cols = [MG[1], WA[1], CY[1], WA[2], MG[1], GR[1]];
    for (let i = 0; i < 9; i++) {
      const x = 3 + i * 3;
      c.vline(x, 3, 4, G[3]);
      c.px(x, 2, cols[i % cols.length]!);
      c.px(x + 1, 3, G[4]);
    }
    c.outline(OUT);
    out.flowerbed = c;
  }

  // Well 24×28
  {
    const c = new Canvas(24, 28);
    c.ellipse(12, 20, 10, 6, S[2]);
    c.ellipse(12, 19, 7, 3, W[0]);
    c.hline(2, 20, 21, S[3]);
    c.rect(3, 6, 2, 14, WD[1]);
    c.rect(19, 6, 2, 14, WD[1]);
    for (let j = 0; j < 5; j++) c.hline(2 + j, 6 - j, 20 - j * 2, j === 0 ? WD[1] : WD[2]);
    c.vline(12, 7, 9, M[3]);
    c.rect(10, 15, 4, 3, WD[2]);
    c.outline(OUT);
    out.well = c;
  }

  // Bush with berries 16×14 (nature: own dark outline)
  {
    const c = new Canvas(16, 14);
    c.circle(5, 8, 4, G[2]);
    c.circle(10, 8, 5, G[2]);
    c.circle(7, 6, 4, G[3]);
    c.dither(0, 0, 16, 14, G[4], (x, y) => (x < 9 && y < 6 ? 0.3 : 0));
    for (const [x, y] of [
      [4, 8],
      [9, 6],
      [12, 9],
    ])
      c.px(x!, y!, RD[1]);
    c.outline(G[0]);
    out.bush2 = c;
  }

  // Lamp along paths (short bollard) 8×16
  {
    const c = new Canvas(8, 16);
    c.rect(2, 4, 4, 11, M[1]);
    c.vline(2, 4, 11, M[2]);
    c.rect(1, 1, 6, 3, M[2]);
    c.rect(2, 2, 4, 1, WA[1]);
    c.outline(OUT);
    out.bollard = c;
  }

  // Shadow blob used under characters and props 16×6
  {
    const c = new Canvas(16, 6);
    c.dither(0, 0, 16, 6, N[0], (x, y) =>
      ((x - 7.5) / 7.5) ** 2 + ((y - 2.5) / 2.5) ** 2 < 1 ? 0.75 : 0,
    );
    out.shadow = c;
  }
  return out;
}
