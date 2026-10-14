import Phaser from 'phaser';

interface Manifest {
  rigStates: string[];
  rigFrames: number;
  decorOrder: string[];
  portraits: string[];
  assets: { key: string; file: string; frameWidth?: number; frameHeight?: number }[];
}

export let MANIFEST: Manifest;

/** Loads the generated asset manifest, every sprite sheet and the Tiled map. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.json('manifest', 'assets/manifest.json');
    this.load.tilemapTiledJSON('world', 'maps/world.json');
    this.load.on('complete', () => {}, this);
  }

  create(): void {
    MANIFEST = this.cache.json.get('manifest') as Manifest;
    for (const a of MANIFEST.assets) {
      if (a.frameWidth)
        this.load.spritesheet(a.key, `assets/${a.file}`, {
          frameWidth: a.frameWidth,
          frameHeight: a.frameHeight!,
        });
      else this.load.image(a.key, `assets/${a.file}`);
    }
    this.load.once('complete', () => {
      this.makeFxTextures();
      this.scene.start('world');
    });
    this.load.start();
  }

  /** Build a texture from ASCII pixel rows. '.' = transparent. */
  private pix(key: string, rows: string[], colors: Record<string, string>): void {
    const h = rows.length;
    const w = rows[0]!.length;
    const tex = this.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = colors[ch];
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    tex.refresh();
  }

  /** Tiny palette-colored textures for particles, markers and the guide. */
  private makeFxTextures(): void {
    const O = '#0b0a1a';
    const Y = '#ffe347';
    const YD = '#b88a1c';
    const C = '#3ff2ff';
    const CD = '#1593b8';
    const L = '#cdd2ef';
    // Slanted streak matching the wind drift, bright enough to read on dark grass.
    this.pix('fx_rain', ['.l', '.m', 'm.', 'm.', 'd.'], {
      l: '#d6defa',
      m: '#a9b8ef',
      d: '#6f7fc0',
    });
    this.pix('fx_snow', ['ww', 'ww'], { w: L });
    this.pix('fx_spark', ['y'], { y: Y });
    // Shiny scrap glint (four-point star)
    this.pix(
      'fx_glint',
      [
        '....d....',
        '...dyd...',
        '...dyd...',
        '.ddyWydd.',
        'dyyWWWyyd',
        '.ddyWydd.',
        '...dyd...',
        '...dyd...',
        '....d....',
      ],
      { y: Y, W: '#ffffff', d: YD },
    );
    this.pix('fx_firefly', ['.g.', 'gyg', '.g.'], { g: '#1fae6d', y: '#5cffab' });
    this.pix('fx_dust', ['dd', 'dd'], { d: '#7a7aac' });
    // Guide arrow (points down at the target)
    this.pix(
      'fx_arrow',
      [
        'ooooooooooo',
        'oyyyyyyyyyo',
        'ooyyyyyyyoo',
        '.oyyyyyyyo.',
        '..oyyyyyo..',
        '...oyyyo...',
        '....oyo....',
        '.....o.....',
      ],
      { o: O, y: Y },
    );
    // Off-screen pointer (points right; rotated in-game)
    this.pix(
      'fx_pointer',
      [
        'oo..........',
        'oyoo........',
        'oyyyoo......',
        'oyyyyyoo....',
        'oyyyyyyyoo..',
        'oyyyyyyyyyo.',
        'oyyyyyyyyyo.',
        'oyyyyyyyoo..',
        'oyyyyyoo....',
        'oyyyoo......',
        'oyoo........',
        'oo..........',
      ],
      { o: O, y: Y },
    );
    // Ground beacon ring under the target
    this.pix(
      'fx_beacon',
      [
        '......dddddddddd......',
        '...ddd..........ddd...',
        '.dd................dd.',
        'd....................d',
        '.dd................dd.',
        '...ddd..........ddd...',
        '......dddddddddd......',
      ],
      { d: YD },
    );
    // Floating "E" keycap above whatever you can interact with
    this.pix(
      'fx_keycap',
      [
        'ooooooooooo',
        'occccccccco',
        'oc.......co',
        'oc.LLLLL.co',
        'oc.L.....co',
        'oc.LLLL..co',
        'oc.L.....co',
        'oc.LLLLL.co',
        'oc.......co',
        'occccccccco',
        'oDDDDDDDDDo',
        'ooooooooooo',
      ],
      { o: O, c: C, L, D: CD, '.': '#141331' },
    );
    // Interaction marker (corner brackets)
    this.pix(
      'fx_target',
      [
        'cccc........cccc',
        'c..............c',
        'c..............c',
        'c..............c',
        ...Array(8).fill('................'),
        'c..............c',
        'c..............c',
        'c..............c',
        'cccc........cccc',
      ],
      { c: C },
    );
    this.pix(
      'fx_range',
      [
        'd.d.d.d.d.d.d.d.',
        ...Array.from({ length: 14 }, (_, i) => (i % 2 ? 'd..............d' : '................')),
        '.d.d.d.d.d.d.d.d',
      ],
      { d: CD },
    );
    // Dithered vignette (Bayer 4×4) — darkens screen edges without smooth gradients
    const vw = this.scale.width;
    const vh = this.scale.height;
    const vt = this.textures.createCanvas('fx_vignette', vw, vh)!;
    const vctx = vt.getContext();
    vctx.fillStyle = O;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < vh; y++)
      for (let x = 0; x < vw; x++) {
        const nx = (x / vw) * 2 - 1;
        const ny = (y / vh) * 2 - 1;
        const d = Math.max(0, Math.hypot(nx * 0.85, ny) - 0.72) / 0.5;
        if (d <= 0) continue;
        if ((bayer[(y % 4) * 4 + (x % 4)]! + 0.5) / 16 < Math.min(1, d)) vctx.fillRect(x, y, 1, 1);
      }
    vt.refresh();
  }
}
