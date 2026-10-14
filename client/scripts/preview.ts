/** Dev helper: compose an upscaled contact sheet of generated assets for review. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const dir = join(process.cwd(), 'public/assets');
const files = process.argv.slice(3);
const out = process.argv[2]!;
const scale = 3;
const imgs = files.map((f) => PNG.sync.read(readFileSync(join(dir, f))));
const W = Math.max(...imgs.map((i) => i.width)) * scale + 8;
const H = imgs.reduce((s, i) => s + i.height * scale + 8, 0);
const o = new PNG({ width: W, height: H });
for (let i = 0; i < o.data.length; i += 4) {
  o.data[i] = 40;
  o.data[i + 1] = 44;
  o.data[i + 2] = 70;
  o.data[i + 3] = 255;
}
let y0 = 4;
for (const img of imgs) {
  for (let y = 0; y < img.height * scale; y++)
    for (let x = 0; x < img.width * scale; x++) {
      const si = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
      if (img.data[si + 3] === 0) continue;
      const di = ((y0 + y) * W + 4 + x) * 4;
      o.data[di] = img.data[si]!;
      o.data[di + 1] = img.data[si + 1]!;
      o.data[di + 2] = img.data[si + 2]!;
      o.data[di + 3] = 255;
    }
  y0 += img.height * scale + 8;
}
writeFileSync(out, PNG.sync.write(o));
