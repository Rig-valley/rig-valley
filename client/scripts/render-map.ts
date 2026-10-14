/**
 * Dev helper: renders public/maps/world.json (tiles + sprite objects) into one PNG
 * so the whole map can be reviewed at a glance.
 *   tsx scripts/render-map.ts <out.png> [scale]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const out = process.argv[2] ?? 'map.png';
const scale = Number(process.argv[3] ?? 1);
const map = JSON.parse(readFileSync(join(root, 'public/maps/world.json'), 'utf8')) as {
  width: number;
  height: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: {
      type: string;
      x: number;
      y: number;
      properties?: { name: string; value: unknown }[];
    }[];
  }[];
};
const load = (f: string) => PNG.sync.read(readFileSync(join(root, 'public/assets', f)));
const tiles = load('tiles.png');
const W = map.width * 16;
const H = map.height * 16;
const img = new PNG({ width: W, height: H });

function blit(src: PNG, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) {
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const si = ((sy + y) * src.width + sx + x) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = (ty * W + tx) * 4;
      img.data[di] = src.data[si]!;
      img.data[di + 1] = src.data[si + 1]!;
      img.data[di + 2] = src.data[si + 2]!;
      img.data[di + 3] = 255;
    }
}

for (const layer of map.layers) {
  if (layer.type !== 'tilelayer' || !layer.data) continue;
  layer.data.forEach((gid, i) => {
    if (!gid) return;
    const t = gid - 1;
    blit(
      tiles,
      (t % 16) * 16,
      Math.floor(t / 16) * 16,
      16,
      16,
      (i % map.width) * 16,
      Math.floor(i / map.width) * 16,
    );
  });
}
const objs = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
const sprites = objs.filter((o) => o.type === 'sprite').sort((a, b) => a.y - b.y);
const cache = new Map<string, PNG>();
for (const o of sprites) {
  const key = String(o.properties?.find((p) => p.name === 'key')?.value);
  if (!cache.has(key)) cache.set(key, load(`${key}.png`));
  const s = cache.get(key)!;
  blit(s, 0, 0, s.width, s.height, Math.round(o.x), Math.round(o.y - s.height));
}

let final = img;
if (scale !== 1) {
  final = new PNG({ width: Math.round(W * scale), height: Math.round(H * scale) });
  for (let y = 0; y < final.height; y++)
    for (let x = 0; x < final.width; x++) {
      const si = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
      const di = (y * final.width + x) * 4;
      for (let k = 0; k < 4; k++) final.data[di + k] = img.data[si + k]!;
    }
}
writeFileSync(out, PNG.sync.write(final));
console.log(`Rendered ${final.width}×${final.height} → ${out}`);
