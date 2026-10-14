/**
 * Tiny pixel canvas for generating palette-locked placeholder art.
 * Every opaque pixel is validated against the locked palette on save.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { PALETTE } from '@rig-valley/shared';

const PALETTE_SET = new Set(PALETTE.map((c) => c.toLowerCase()));

export type Color = string | null;

/** 4×4 Bayer matrix (0..15) for ordered dithering. */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function bayer(x: number, y: number): number {
  return (BAYER4[((y % 4) + 4) % 4]![((x % 4) + 4) % 4]! + 0.5) / 16;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return (
      '#' +
      [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  px(x: number, y: number, c: Color): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (c === null) {
      this.data[i + 3] = 0;
      return;
    }
    const [r, g, b] = hexToRgb(c);
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  /** Rectangle outline. */
  box(x: number, y: number, w: number, h: number, c: Color): void {
    for (let i = 0; i < w; i++) {
      this.px(x + i, y, c);
      this.px(x + i, y + h - 1, c);
    }
    for (let j = 0; j < h; j++) {
      this.px(x, y + j, c);
      this.px(x + w - 1, y + j, c);
    }
  }

  hline(x: number, y: number, w: number, c: Color): void {
    this.rect(x, y, w, 1, c);
  }
  vline(x: number, y: number, h: number, c: Color): void {
    this.rect(x, y, 1, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  circle(cx: number, cy: number, r: number, c: Color, fill = true): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (fill ? d <= r * r + r * 0.6 : Math.abs(Math.sqrt(d) - r) < 0.6)
          this.px(cx + x, cy + y, c);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color): void {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) this.px(cx + x, cy + y, c);
      }
    }
  }

  /** Fill with `c` where Bayer threshold < t (0..1). Ordered dithering. */
  dither(
    x: number,
    y: number,
    w: number,
    h: number,
    c: Color,
    t: number | ((x: number, y: number) => number),
  ): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const tt = typeof t === 'number' ? t : t(i, j);
        if (bayer(x + i, y + j) < tt) this.px(x + i, y + j, c);
      }
    }
  }

  /** Draw a dark outline around all opaque pixels (for man-made objects). */
  outline(c: Color, diagonal = false): void {
    const solid = (x: number, y: number) => this.get(x, y) !== null;
    const marks: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (solid(x, y)) continue;
        const n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        const d =
          diagonal &&
          (solid(x - 1, y - 1) ||
            solid(x + 1, y - 1) ||
            solid(x - 1, y + 1) ||
            solid(x + 1, y + 1));
        if (n || d) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.px(x, y, c);
  }

  /** Copy another canvas onto this one. */
  blit(
    src: Canvas,
    dx: number,
    dy: number,
    sx = 0,
    sy = 0,
    sw = src.w,
    sh = src.h,
    flipX = false,
  ): void {
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const c = src.get(sx + (flipX ? sw - 1 - i : i), sy + j);
        if (c) this.px(dx + i, dy + j, c);
      }
    }
  }

  /** Replace colors (for recolors like rig paint or hair). */
  recolor(map: Record<string, string>): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c && map[c]) this.px(x, y, map[c]!);
      }
    }
  }

  clone(): Canvas {
    const c = new Canvas(this.w, this.h);
    c.data.set(this.data);
    return c;
  }

  save(path: string, opts: { allowAnyColor?: boolean } = {}): void {
    if (!opts.allowAnyColor) {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const c = this.get(x, y);
          if (c && !PALETTE_SET.has(c))
            throw new Error(`${path}: off-palette color ${c} at ${x},${y}`);
        }
      }
    }
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, PNG.sync.write(png));
  }
}

/** Seeded RNG for deterministic art. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pack equal-sized frames into a horizontal/vertical sheet. */
export function sheet(frames: Canvas[][], fw: number, fh: number): Canvas {
  const rows = frames.length;
  const cols = Math.max(...frames.map((r) => r.length));
  const out = new Canvas(cols * fw, rows * fh);
  frames.forEach((row, r) => row.forEach((f, c) => out.blit(f, c * fw, r * fh)));
  return out;
}
