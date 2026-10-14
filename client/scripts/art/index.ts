/**
 * Generates all placeholder art into client/public/assets as PNG sprite sheets,
 * plus a manifest the game loader reads. Run: pnpm art
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAIR_COLORS } from '@rig-valley/shared';
import { buildTileset } from './tiles.js';
import {
  RIG_FRAMES,
  RIG_H,
  RIG_STATES,
  RIG_W,
  buildCatSheet,
  buildCoinSheet,
  buildCoolingSheet,
  buildDroneSheet,
  buildLightTexture,
  buildRigSheets,
  buildSlotSheet,
  buildSparkleSheet,
  buildSteamSheet,
} from './rigs.js';
import {
  CH,
  CW,
  PORTRAIT_IDS,
  buildNpcSheets,
  buildPlayerSheets,
  buildPortraits,
} from './characters.js';
import {
  DECOR_ORDER,
  buildBuildings,
  buildDecorSheet,
  buildExtraProps,
  buildProps,
} from './props.js';
import { buildIcons } from './icons.js';
import { Canvas } from './canvas.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../public/assets');

interface ManifestEntry {
  key: string;
  file: string;
  frameWidth?: number;
  frameHeight?: number;
}
const manifest: ManifestEntry[] = [];

function save(key: string, c: Canvas, frame?: [number, number]) {
  const file = `${key}.png`;
  c.save(join(OUT, file));
  manifest.push({ key, file, ...(frame ? { frameWidth: frame[0], frameHeight: frame[1] } : {}) });
}

save('tiles', buildTileset());
for (const [paint, c] of Object.entries(buildRigSheets())) save(`rig_${paint}`, c, [RIG_W, RIG_H]);
save('slot', buildSlotSheet(), [16, 16]);
save('coin', buildCoinSheet(), [10, 10]);
save('sparkle', buildSparkleSheet(), [7, 7]);
save('steam', buildSteamSheet(), [8, 8]);
save('cooling', buildCoolingSheet(), [16, 22]);
save('drone', buildDroneSheet(), [12, 10]);
save('cat', buildCatSheet(), [14, 10]);
save('light64', buildLightTexture(64));
save('light128', buildLightTexture(128));
save('light32', buildLightTexture(32));

const player = buildPlayerSheets();
save('player_body', player.body, [CW, CH]);
for (const hc of HAIR_COLORS) save(`hair_${hc.id}`, player.hair[hc.id]!, [CW, CH]);
for (const [hat, c] of Object.entries(player.hats)) save(`hat_${hat}`, c, [CW, CH]);
for (const [id, c] of Object.entries(buildNpcSheets())) save(`npc_${id}`, c, [CW, CH]);
save('portraits', buildPortraits(), [32, 32]);

for (const [id, c] of Object.entries(buildBuildings())) save(`bld_${id}`, c);
const props = buildProps();
for (const [id, c] of Object.entries(props)) {
  if (id === 'holocoin') save('holocoin', c, [20, 20]);
  else save(`prop_${id}`, c);
}
for (const [id, c] of Object.entries(buildExtraProps())) save(`prop_${id}`, c);
save('decor', buildDecorSheet(), [16, 24]);
const icons = buildIcons();
save('icons', icons, [16, 16]);

// Favicon: the CPU icon at 2×.
{
  const fav = new Canvas(32, 32);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const c = icons.get(4 * 16 + x, y);
      if (c) fav.rect(x * 2, y * 2, 2, 2, c);
    }
  fav.save(join(OUT, 'favicon.png'));
}

writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      rigStates: RIG_STATES,
      rigFrames: RIG_FRAMES,
      decorOrder: DECOR_ORDER,
      portraits: PORTRAIT_IDS,
      assets: manifest,
    },
    null,
    2,
  ),
);
console.log(`Generated ${manifest.length} assets in ${OUT}`);
