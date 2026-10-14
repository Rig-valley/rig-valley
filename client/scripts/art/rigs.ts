/** Rigs, slots, cooling units and small effect sprites. Neon = status (MASTERPLAN §3). */
import { RAMPS, RIG_PAINTS, type RigPaint } from '@rig-valley/shared';
import { Canvas, bayer } from './canvas.js';

const M = RAMPS.metal;
const N = RAMPS.night;
const CY = RAMPS.cyan;
const MG = RAMPS.magenta;
const GR = RAMPS.green;
const YE = RAMPS.yellow;
const RD = RAMPS.red;
const WA = RAMPS.warm;
const CO = RAMPS.coin;
const OUT = N[0];

export const RIG_W = 16;
export const RIG_H = 28;
export const RIG_STATES = [
  'frame',
  'installed',
  'booting',
  'mining',
  'ready',
  'overheat',
  'broken',
  'off',
] as const;
export const RIG_FRAMES = 4;

/** [shadow, body, light, top] per casing paint. */
const PAINT: Record<RigPaint, [string, string, string, string]> = {
  steel: [M[0], M[1], M[2], M[3]],
  magenta: [N[2], MG[0], MG[1], MG[1]],
  mint: [RAMPS.grass[1], GR[0], GR[1], RAMPS.grass[5]],
  gold: [CO[0], CO[1], CO[2], CO[3]],
};

function fan(
  c: Canvas,
  cx: number,
  cy: number,
  blade: string,
  hub: string,
  frame: number,
  spinning: boolean,
) {
  // 5×5 fan: ring + rotating blades
  c.circle(cx, cy, 2, N[1]);
  const f = spinning ? frame % 2 : 0;
  const pts =
    f === 0
      ? [
          [-1, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
        ]
      : [
          [0, -2],
          [0, 2],
          [-2, 0],
          [2, 0],
        ];
  for (const [dx, dy] of pts) c.px(cx + dx!, cy + dy!, blade);
  c.px(cx, cy, hub);
}

function drawRig(paint: RigPaint, state: (typeof RIG_STATES)[number], frame: number): Canvas {
  const c = new Canvas(RIG_W, RIG_H);
  const [sh, body, light, top] = PAINT[paint];

  // pad
  c.rect(1, 23, 14, 3, M[1]);
  c.hline(1, 23, 14, M[2]);
  c.hline(1, 25, 14, M[0]);
  // power cable stub
  c.px(14, 24, N[3]);

  if (state === 'frame') {
    // open skeleton: posts and rails only
    for (const x of [3, 12]) {
      c.vline(x, 5, 18, body);
      c.px(x, 5, top);
    }
    c.hline(3, 5, 10, top);
    c.hline(3, 14, 10, sh);
    c.hline(3, 22, 10, sh);
    // empty board
    c.rect(5, 18, 6, 3, N[2]);
    c.dither(5, 18, 6, 3, N[3], 0.3);
    c.outline(OUT);
    return c;
  }

  // casing
  c.rect(3, 4, 10, 19, body);
  c.vline(3, 4, 19, light); // light from the top-left
  c.hline(3, 4, 10, top);
  c.vline(12, 5, 18, sh);
  c.hline(4, 22, 9, sh);
  // window
  c.rect(5, 7, 6, 13, N[0]);
  c.box(5, 7, 6, 13, sh);
  c.px(5, 7, light);

  const spinning = state === 'mining' || state === 'ready';
  let blade: string = M[1];
  let hub: string = M[2];
  if (spinning) {
    blade = frame % 2 === 0 ? CY[1] : CY[0];
    hub = CY[1];
  } else if (state === 'overheat') {
    blade = frame % 2 === 0 ? WA[0] : RD[0];
    hub = WA[1];
  } else if (state === 'booting') {
    blade = M[2];
    hub = YE[0];
  }
  fan(c, 8, 10, blade, hub, frame, spinning || state === 'overheat');
  fan(c, 8, 16, blade, hub, frame + 1, spinning || state === 'overheat');

  // window glow for active rigs (dithered, never smooth)
  if (spinning) {
    c.dither(6, 8, 4, 11, CY[0], (x, y) => ((x + y + frame) % 5 === 0 ? 0.5 : 0));
  }
  if (state === 'overheat') c.dither(6, 8, 4, 11, RD[0], 0.18);

  // LED
  let led: string | null = N[3];
  if (state === 'installed') led = GR[0];
  if (state === 'booting') led = frame % 2 === 0 ? YE[1] : YE[0];
  if (state === 'mining' || state === 'ready') led = GR[1];
  if (state === 'overheat') led = frame % 2 === 0 ? RD[1] : RD[0];
  if (state === 'broken') led = RD[0];
  c.px(11, 5, led);
  c.px(10, 5, state === 'off' || state === 'broken' ? N[2] : sh);

  // RGB strip (cyan/magenta = active)
  if (spinning) {
    for (let i = 0; i < 8; i++) c.px(4 + i, 21, (i + frame) % 4 < 2 ? CY[1] : MG[1]);
  } else {
    c.hline(4, 21, 8, N[2]);
  }

  if (state === 'broken') {
    c.line(6, 8, 9, 13, M[3]);
    c.line(9, 13, 7, 18, M[3]);
  }
  c.outline(OUT);
  return c;
}

export function buildRigSheets(): Record<RigPaint, Canvas> {
  const out = {} as Record<RigPaint, Canvas>;
  for (const paint of RIG_PAINTS) {
    const sheet = new Canvas(RIG_W * RIG_FRAMES, RIG_H * RIG_STATES.length);
    RIG_STATES.forEach((st, row) => {
      for (let f = 0; f < RIG_FRAMES; f++)
        sheet.blit(drawRig(paint, st, f), f * RIG_W, row * RIG_H);
    });
    out[paint] = sheet;
  }
  return out;
}

/** Empty slot hologram (dashed cyan), 2 frames. */
export function buildSlotSheet(): Canvas {
  const s = new Canvas(32, 16);
  for (let f = 0; f < 2; f++) {
    const ox = f * 16;
    for (let i = 0; i < 12; i++) {
      const on = (i + f) % 3 !== 2;
      if (!on) continue;
      s.px(ox + 2 + i, 3, CY[1]);
      s.px(ox + 2 + i, 13, CY[0]);
    }
    for (let j = 0; j < 10; j++) {
      const on = (j + f) % 3 !== 2;
      if (!on) continue;
      s.px(ox + 2, 3 + j, CY[1]);
      s.px(ox + 13, 3 + j, CY[0]);
    }
    s.dither(ox + 3, 4, 10, 9, CY[0], (x, y) => (bayer(x + f, y) < 0.12 ? 1 : 0));
    // corner brackets
    for (const [x, y] of [
      [2, 3],
      [13, 3],
      [2, 13],
      [13, 13],
    ])
      s.px(ox + x!, y!, CY[1]);
  }
  return s;
}

/** Spinning coin, 4 frames of 10×10. */
export function buildCoinSheet(): Canvas {
  const s = new Canvas(40, 10);
  const widths = [4, 3, 1, 3];
  widths.forEach((rx, f) => {
    const c = new Canvas(10, 10);
    c.ellipse(5, 5, rx, 4, CO[2]);
    if (rx > 1) {
      c.ellipse(5, 5, Math.max(0, rx - 2), 2, CO[1]);
      c.px(5 - Math.floor(rx / 2), 3, CO[3]);
    }
    c.outline(CO[0]);
    s.blit(c, f * 10, 0);
  });
  return s;
}

/** Sparkle 7×7, 2 frames. */
export function buildSparkleSheet(): Canvas {
  const s = new Canvas(14, 7);
  s.vline(3, 1, 5, CO[3]);
  s.hline(1, 3, 5, CO[3]);
  s.px(3, 3, WA[2]);
  s.vline(10, 2, 3, CO[2]);
  s.hline(9, 3, 3, CO[2]);
  return s;
}

/** Steam puff 8×8, 2 frames. */
export function buildSteamSheet(): Canvas {
  const s = new Canvas(16, 8);
  s.dither(1, 1, 6, 6, M[3], (x, y) => (Math.hypot(x - 2.5, y - 2.5) < 3 ? 0.7 : 0));
  s.dither(9, 0, 7, 7, M[4], (x, y) => (Math.hypot(x - 3, y - 3) < 3.5 ? 0.45 : 0));
  return s;
}

/** Cooling units: 3 levels × 2 frames, 16×22 each. */
export function buildCoolingSheet(): Canvas {
  const s = new Canvas(32, 66);
  for (let lvl = 1; lvl <= 3; lvl++) {
    for (let f = 0; f < 2; f++) {
      const c = new Canvas(16, 22);
      const w = lvl === 1 ? 10 : lvl === 2 ? 12 : 14;
      const h = lvl === 1 ? 10 : lvl === 2 ? 13 : 16;
      const x0 = Math.floor((16 - w) / 2);
      const y0 = 21 - h;
      c.rect(x0, y0, w, h, M[2]);
      c.hline(x0, y0, w, M[4]);
      c.vline(x0, y0, h, M[3]);
      c.vline(x0 + w - 1, y0 + 1, h - 1, M[1]);
      c.hline(x0, y0 + h - 1, w, M[0]);
      // fan grill
      const fans = lvl === 1 ? 1 : 2;
      for (let i = 0; i < fans; i++) {
        const cx = fans === 1 ? 8 : x0 + 3 + i * (w - 6);
        const cy = y0 + 4;
        c.circle(cx, cy, 2, N[1]);
        const pts =
          f === 0
            ? [
                [-1, -1],
                [1, 1],
                [1, -1],
                [-1, 1],
              ]
            : [
                [0, -2],
                [0, 2],
                [-2, 0],
                [2, 0],
              ];
        for (const [dx, dy] of pts) c.px(cx + dx!, cy + dy!, CY[1]);
        c.px(cx, cy, CY[0]);
      }
      // vents
      for (let j = y0 + 8; j < y0 + h - 2; j += 2) c.hline(x0 + 2, j, w - 4, M[1]);
      // status LED + level pips
      c.px(x0 + w - 3, y0 + h - 3, CY[1]);
      for (let i = 0; i < lvl; i++) c.px(x0 + 2 + i * 2, y0 + h - 3, GR[1]);
      if (lvl === 3) {
        // water pipes
        c.vline(x0 - 1 < 0 ? 0 : x0 - 1, y0 + 4, h - 5, RAMPS.water[3]);
      }
      c.outline(OUT);
      s.blit(c, f * 16, (lvl - 1) * 22);
    }
  }
  return s;
}

/** Service drone 12×10, 2 frames. */
export function buildDroneSheet(): Canvas {
  const s = new Canvas(24, 10);
  for (let f = 0; f < 2; f++) {
    const c = new Canvas(12, 10);
    c.rect(3, 4, 6, 3, M[2]);
    c.hline(3, 4, 6, M[3]);
    c.px(5, 6, CY[1]);
    c.px(6, 6, CY[1]);
    c.vline(2, 3, 2, M[1]);
    c.vline(9, 3, 2, M[1]);
    const blur = f === 0 ? [0, 1, 2, 3, 4] : [1, 2, 3];
    for (const b of blur) {
      c.px(b, 2, M[4]);
      c.px(7 + b, 2, M[4]);
    }
    c.px(5, 8, GR[1]);
    c.outline(OUT);
    s.blit(c, f * 12, 0);
  }
  return s;
}

/** Sleeping cat 14×10, 2 frames (breathing). Two coats. */
export function buildCatSheet(): Canvas {
  const s = new Canvas(28, 20);
  const coats = [
    [RAMPS.wood[1], RAMPS.wood[2], RAMPS.wood[3]],
    [N[1], N[2], N[3]],
  ];
  coats.forEach((coat, row) => {
    for (let f = 0; f < 2; f++) {
      const c = new Canvas(14, 10);
      const rise = f;
      c.ellipse(7, 6 - rise, 5, 3, coat[1]!);
      c.dither(3, 3 - rise, 8, 3, coat[2]!, 0.5);
      // head tucked
      c.circle(3, 6, 2, coat[1]!);
      c.px(2, 3, coat[2]!);
      c.px(4, 3, coat[2]!);
      c.px(2, 6, coat[0]!);
      // tail
      c.hline(9, 8, 4, coat[0]!);
      c.px(12, 7, coat[1]!);
      c.outline(OUT);
      s.blit(c, f * 14, row * 10);
    }
  });
  return s;
}

/** Bayer-dithered light pool used to cut holes in the night overlay. White = full light. */
export function buildLightTexture(size: number): Canvas {
  const c = new Canvas(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - r + 0.5, y - r + 0.5) / r;
      const t = Math.max(0, 1 - d);
      // stepped falloff with ordered dithering between steps
      if (bayer(x, y) < Math.pow(t, 0.8) * 1.15) c.px(x, y, RAMPS.warm[2]);
    }
  }
  return c;
}
