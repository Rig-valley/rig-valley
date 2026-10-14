/**
 * The world: tilemap, player, NPCs, rigs, lighting, ambience, the guide, interaction
 * targeting and the opening intro. Rendering only — every game rule is decided by the server.
 */
import Phaser from 'phaser';
import {
  FIELDS,
  SHOPS,
  SCRAP_SPOTS,
  STAGES,
  TOWNFOLK_HOURS,
  STATUS_NEON,
  TILE as TILE_PX,
  allSlots,
  calendar,
  getItem,
  isCoolingUnit,
  isShopOpen,
  nightFactor,
  scrapFind,
  slotAt,
  type RigDTO,
  type StateDTO,
} from '@rig-valley/shared';
import { MANIFEST } from './BootScene';
import { currentObjective, type Objective, type WorldPoints } from './guide';
import { rigName, store, type Interaction } from '../store';
import { setHum, sfx } from '../audio';

const T = TILE_PX;
type Dir = 'down' | 'left' | 'right' | 'up';
const DIRS: Dir[] = ['down', 'left', 'right', 'up'];
const DV: Record<Dir, [number, number]> = {
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
};

/** True when a key event comes from a text field (keys belong to the field, not the game). */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest('input, textarea, select'))
  );
}

/** How close (px) the player's feet must be to an object to interact. */
const REACH = 20;

const LIGHT_COLORS: Record<string, number> = {
  warm: 0xffae57,
  cyan: 0x3ff2ff,
  magenta: 0xff52dc,
  green: 0x5cffab,
  red: 0xff4558,
  yellow: 0xffe347,
};

const NPC_NAMES: Record<string, string> = {
  mia: 'Mia',
  bo: 'Bo',
  dex: 'Dex',
  vera: 'Vera',
  kai: 'Kai',
};

interface StaticLight {
  x: number;
  y: number;
  radius: number;
  color: string;
  flicker: boolean;
  glow?: Phaser.GameObjects.Image;
}

interface RigView {
  sprite: Phaser.GameObjects.Sprite;
  body: Phaser.GameObjects.Zone;
  coin?: Phaser.GameObjects.Sprite;
  steam?: Phaser.GameObjects.Particles.ParticleEmitter;
  glow?: Phaser.GameObjects.Image;
  key: string;
}

interface NpcView {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  home: { x: number; y: number };
  shop?: string;
  wander: boolean;
  target?: { x: number; y: number };
  nextMove: number;
  body: Phaser.GameObjects.Zone;
}

interface Zone {
  action: string;
  label: string;
  rect: Phaser.Geom.Rectangle;
  festival: boolean;
}

export interface Prompt {
  title: string;
  status?: string;
  statusColor?: string;
  detail?: string;
  action: string;
  /** Anchor as a fraction of the visible game view (0..1). */
  screen: { fx: number; fy: number };
}

export interface WorldLabel {
  text: string;
  fx: number;
  fy: number;
}

export interface GuideView {
  objective: Objective | null;
  /** Distance to the target in tiles (meters), when there is one. */
  distance: number | null;
}

export class WorldScene extends Phaser.Scene {
  mode: 'title' | 'intro' | 'play' = 'title';
  private map!: Phaser.Tilemaps.Tilemap;
  private ground!: Phaser.Tilemaps.TilemapLayer;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private locks = new Map<number, Phaser.GameObjects.Zone[]>();
  /** Caution tape and shade over fields that are still locked. */
  private lockFx = new Map<number, Phaser.GameObjects.Graphics>();
  private lockHintAt = 0;
  private scraps = new Map<number, Phaser.GameObjects.Image>();
  private scrapDay = -1;
  private nextTwinkle = 0;
  private player?: Phaser.Physics.Arcade.Sprite;
  private playerShadow?: Phaser.GameObjects.Image;
  private hair?: Phaser.GameObjects.Sprite;
  private hat?: Phaser.GameObjects.Sprite;
  private facing: Dir = 'down';
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private rigs = new Map<number, RigView>();
  private slots = new Map<string, Phaser.GameObjects.Sprite>();
  private coolers = new Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; body: Phaser.GameObjects.Zone }
  >();
  private decor = new Map<
    string,
    { sprite: Phaser.GameObjects.Sprite; body: Phaser.GameObjects.Zone }
  >();
  private npcs = new Map<string, NpcView>();
  private staticLights: StaticLight[] = [];
  private overlay!: Phaser.GameObjects.RenderTexture;
  private lightImg: Record<number, Phaser.GameObjects.Image> = {};
  private waterTiles: { x: number; y: number; mask: number }[] = [];
  private waterFrame = 0;
  private marker?: Phaser.GameObjects.Image;
  private keycap?: Phaser.GameObjects.Image;
  private arrow?: Phaser.GameObjects.Image;
  private beacon?: Phaser.GameObjects.Image;
  private pointer?: Phaser.GameObjects.Image;
  private rangeMarks: Phaser.GameObjects.Image[] = [];
  private mailbox?: Phaser.GameObjects.Image;
  private box?: Phaser.GameObjects.Image;
  private stand: Phaser.GameObjects.Image[] = [];
  private cats: Phaser.GameObjects.Sprite[] = [];
  private drones: Phaser.GameObjects.Sprite[] = [];
  private zones: Zone[] = [];
  private poles: { x: number; y: number }[] = [];
  private weatherFx?: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private glintFx?: Phaser.GameObjects.Particles.ParticleEmitter;
  private weatherKind = '';
  private flash?: Phaser.GameObjects.Rectangle;
  private vignette?: Phaser.GameObjects.Image;
  private heat?: Phaser.GameObjects.Rectangle;
  private stepTimer = 0;
  private demoRigs: Phaser.GameObjects.Sprite[] = [];
  private neonGlow?: Phaser.GameObjects.Image;
  private lastState: StateDTO | null = null;
  private guide: GuideView = { objective: null, distance: null };
  private introEvents: Phaser.Time.TimerEvent[] = [];
  private introTween?: Phaser.Tweens.Tween;
  private introDone?: () => void;
  private guideTimer = 0;
  private points: WorldPoints = { zones: new Map(), npcs: new Map() };
  current: Interaction | null = null;
  onPrompt: (p: Prompt | null) => void = () => {};
  onLabels: (labels: WorldLabel[]) => void = () => {};
  onGuide: (g: GuideView) => void = () => {};

  constructor() {
    super('world');
  }

  create(): void {
    this.map = this.make.tilemap({ key: 'world' });
    const tiles = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    this.ground = this.map.createLayer('ground', tiles, 0, 0)!.setDepth(-1000);
    this.map.createLayer('deco', tiles, 0, 0)!.setDepth(-900);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setRoundPixels(true);

    this.indexWater();
    this.time.addEvent({ delay: 650, loop: true, callback: () => this.animateWater() });

    this.createAnims();
    this.solids = this.physics.add.staticGroup();
    this.buildColliders();
    this.buildObjects();
    this.drawPowerLines();

    // Night overlay (screen space) + reusable light stamps
    const { width, height } = this.scale;
    this.overlay = this.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(90_000);
    for (const size of [32, 64, 128])
      this.lightImg[size] = this.make.image({ key: `light${size}`, add: false }).setOrigin(0.5);
    this.vignette = this.add
      .image(0, 0, 'fx_vignette')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(90_002)
      .setAlpha(0.55);
    this.flash = this.add
      .rectangle(0, 0, width, height, 0xcdd2ef, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(90_003);
    this.heat = this.add
      .rectangle(0, 0, width, height, 0xffae57, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(89_999);

    // Interaction marker, floating keycap and the guide
    this.marker = this.add.image(0, 0, 'fx_target').setOrigin(0).setDepth(-800).setVisible(false);
    this.tweens.add({
      targets: this.marker,
      alpha: { from: 1, to: 0.45 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    });
    this.keycap = this.add.image(0, 0, 'fx_keycap').setDepth(85_500).setVisible(false);
    this.arrow = this.add.image(0, 0, 'fx_arrow').setDepth(85_400).setVisible(false);
    this.beacon = this.add
      .image(0, 0, 'fx_beacon')
      .setDepth(-820)
      .setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: this.beacon,
      scale: { from: 0.7, to: 1.15 },
      alpha: { from: 1, to: 0.3 },
      duration: 900,
      repeat: -1,
      ease: 'Stepped',
    });
    this.pointer = this.add
      .image(0, 0, 'fx_pointer')
      .setScrollFactor(0)
      .setDepth(90_100)
      .setVisible(false);

    // Ambience
    this.fireflies = this.add
      .particles(0, 0, 'fx_firefly', {
        x: { min: 0, max: this.scale.width },
        y: { min: 0, max: this.scale.height },
        lifespan: { min: 2500, max: 5000 },
        speedX: { min: -6, max: 6 },
        speedY: { min: -5, max: 3 },
        alpha: { values: [0, 1, 0.3, 1, 0] },
        frequency: 260,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setScrollFactor(0)
      .setDepth(90_001);
    this.dust = this.add
      .particles(0, 0, 'fx_dust', {
        lifespan: 380,
        speedX: { min: -10, max: 10 },
        speedY: { min: -8, max: -2 },
        alpha: { start: 0.8, end: 0 },
        emitting: false,
      })
      .setDepth(-700);
    this.glintFx = this.add
      .particles(0, 0, 'fx_spark', {
        lifespan: 600,
        speedX: { min: -6, max: 6 },
        speedY: { min: -24, max: -12 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(85_000);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D', false) as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;
    // Never let Phaser swallow keys globally: players must be able to type a, s, d, w,
    // spaces and arrows into text fields (farm names, recovery words, quantities).
    kb.clearCaptures();
    kb.disableGlobalCapture();
    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      // Stop the page from scrolling while playing.
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        e.preventDefault();
    });
    kb.on('keydown-E', (e: KeyboardEvent) => !isTyping(e.target) && this.interact());
    kb.on('keydown-SPACE', (e: KeyboardEvent) => !isTyping(e.target) && this.interact());

    // Title backdrop: the garage at night with a few demo rigs.
    this.cameras.main.centerOn(15 * T, 29 * T);
    for (const [x, y] of [
      [17, 31],
      [18, 31],
      [20, 31],
      [17, 33],
      [19, 33],
      [21, 35],
    ] as const) {
      const s = this.add.sprite(x * T + 8, y * T + 16, 'rig_steel').setOrigin(0.5, 1);
      s.setDepth(s.y).play('rig_steel_mining');
      this.demoRigs.push(s);
    }
    this.neonGlow = this.add
      .image(7.5 * T, 26.6 * T, 'light64')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff52dc)
      .setAlpha(0.35)
      .setScale(0.9)
      .setDepth(80_600);

    store.on('state', (s) => this.syncState(s));
    store.on('event', (e) => {
      if (e.kind === 'harvest') this.harvestFx(e.rigId, e.coins);
      if (e.kind === 'sleep') this.cameras.main.flash(400, 11, 10, 26);
    });
  }

  // ------------------------------------------------------------------ setup
  private createAnims(): void {
    const a = this.anims;
    const rowAnim = (
      key: string,
      tex: string,
      row: number,
      frames: number,
      rate: number,
      repeat = -1,
    ) => {
      if (a.exists(key)) return;
      a.create({
        key,
        frames: a.generateFrameNumbers(tex, {
          start: row * frames,
          end: row * frames + frames - 1,
        }),
        frameRate: rate,
        repeat,
      });
    };
    for (const paint of ['steel', 'magenta', 'mint', 'gold']) {
      MANIFEST.rigStates.forEach((st, row) => {
        const rate =
          st === 'mining' || st === 'ready' ? 8 : st === 'overheat' ? 10 : st === 'booting' ? 3 : 2;
        rowAnim(`rig_${paint}_${st}`, `rig_${paint}`, row, MANIFEST.rigFrames, rate);
      });
    }
    const charKeys = [
      'player_body',
      ...['ink', 'chestnut', 'copper', 'honey', 'mint', 'magenta'].map((h) => `hair_${h}`),
      ...['cap', 'beanie', 'headset', 'straw', 'crown'].map((h) => `hat_${h}`),
      ...['mia', 'bo', 'dex', 'vera', 'kai'].map((n) => `npc_${n}`),
    ];
    for (const k of charKeys) {
      DIRS.forEach((d, row) => {
        rowAnim(`${k}_walk_${d}`, k, row, 4, 8);
        if (!a.exists(`${k}_idle_${d}`))
          a.create({ key: `${k}_idle_${d}`, frames: [{ key: k, frame: row * 4 }], frameRate: 1 });
      });
    }
    rowAnim('slot', 'slot', 0, 2, 2);
    rowAnim('coin', 'coin', 0, 4, 8);
    rowAnim('holocoin', 'holocoin', 0, 4, 5);
    rowAnim('drone', 'drone', 0, 2, 12);
    rowAnim('cat0', 'cat', 0, 2, 1);
    rowAnim('cat1', 'cat', 1, 2, 1);
    for (let lvl = 0; lvl < 3; lvl++) rowAnim(`cooling${lvl + 1}`, 'cooling', lvl, 2, 8);
  }

  private indexWater(): void {
    const layer = this.ground.layer;
    for (let y = 0; y < layer.height; y++)
      for (let x = 0; x < layer.width; x++) {
        const idx = layer.data[y]![x]!.index - 1;
        if (idx >= 16 && idx < 32) this.waterTiles.push({ x, y, mask: idx - 16 });
      }
  }

  private animateWater(): void {
    this.waterFrame ^= 1;
    const base = this.waterFrame ? 32 : 16;
    for (const w of this.waterTiles) this.ground.putTileAt(base + w.mask + 1, w.x, w.y);
  }

  private addSolid(x: number, y: number, w: number, h: number): Phaser.GameObjects.Zone {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.add.existing(z, true);
    this.solids.add(z);
    return z;
  }

  private buildColliders(): void {
    for (const o of this.map.getObjectLayer('colliders')?.objects ?? []) {
      const z = this.addSolid(o.x!, o.y!, o.width!, o.height!);
      const m = /^lock_(\d)$/.exec(o.name ?? '');
      if (m) {
        const stage = Number(m[1]);
        if (!this.locks.has(stage)) this.locks.set(stage, []);
        this.locks.get(stage)!.push(z);
        z.setData('lockStage', stage);
        this.drawLock(stage, o.x!, o.y!, o.width!, o.height!);
      }
    }
  }

  /** Today's shiny scraps: twinkling glints that pay out when searched. */
  private syncScraps(s: StateDTO): void {
    const want = new Set(s.farm.daily.scraps);
    const sameDay = this.scrapDay === s.farm.day;
    for (const [spot, img] of this.scraps) {
      if (want.has(spot)) continue;
      this.scraps.delete(spot);
      if (sameDay) this.scrapFound(spot, img.x, img.y);
      this.tweens.killTweensOf(img);
      img.destroy();
    }
    this.scrapDay = s.farm.day;
    for (const spot of want) {
      if (this.scraps.has(spot)) continue;
      const p = SCRAP_SPOTS[spot];
      if (!p) continue;
      const img = this.add
        .image(p.x * T + 8, p.y * T + 10, 'fx_glint')
        .setDepth(p.y * T + 10)
        .setScale(0.8);
      this.tweens.add({
        targets: img,
        scale: { from: 0.9, to: 1.5 },
        alpha: { from: 0.7, to: 1 },
        y: img.y - 3,
        duration: 520,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 500,
        ease: 'Sine.easeInOut',
      });
      this.scraps.set(spot, img);
    }
  }

  private twinkleScraps(time: number): void {
    if (time < this.nextTwinkle || !this.scraps.size) return;
    this.nextTwinkle = time + 260;
    const all = [...this.scraps.values()];
    const img = all[Math.floor(Math.random() * all.length)]!;
    this.glintFx?.emitParticleAt(img.x + (Math.random() - 0.5) * 10, img.y - 4, 1);
  }

  private scrapFound(spot: number, x: number, y: number): void {
    const s = this.lastState;
    sfx('coin');
    const sparks = this.add
      .particles(x, y - 4, 'fx_spark', {
        lifespan: 500,
        speed: { min: 30, max: 70 },
        scale: { start: 2, end: 0 },
        emitting: false,
      })
      .setDepth(85_000);
    sparks.explode(14);
    this.time.delayedCall(700, () => sparks.destroy());
    if (!s) return;
    const find = scrapFind(s.farm.id, s.farm.day, spot);
    const label = 'coins' in find ? `+${find.coins}` : `+${getItem(find.itemId)?.name ?? 'item'}`;
    store.emit('coinBurst', {
      ...this.screenOf(x, y - 8),
      label,
      count: 'coins' in find ? 4 : 0,
    });
  }

  /** Locked fields get a dark shade and yellow-black caution tape, so the edge is visible. */
  private drawLock(stage: number, x: number, y: number, w: number, h: number): void {
    let g = this.lockFx.get(stage);
    if (!g) {
      // Hidden until play starts: the title shot shows the valley without caution tape.
      g = this.add.graphics().setDepth(-880).setVisible(false);
      this.lockFx.set(stage, g);
    }
    g.fillStyle(0x0b0a1a, 0.38).fillRect(x, y, w, h);
    const seg = 4;
    const tape = (x0: number, y0: number, len: number, horizontal: boolean) => {
      for (let i = 0; i < len; i += seg) {
        g.fillStyle((i / seg) % 2 ? 0x16152b : 0xffd23f, 1);
        const n = Math.min(seg, len - i);
        if (horizontal) g.fillRect(x0 + i, y0, n, 2);
        else g.fillRect(x0, y0 + i, 2, n);
      }
    };
    tape(x, y, w, true);
    tape(x, y + h - 2, w, true);
    tape(x, y, h, false);
    tape(x + w - 2, y, h, false);
  }

  /** Bumping into a locked field explains why (at most every few seconds). */
  private bumped(z: Phaser.GameObjects.GameObject): void {
    const stage = z.getData('lockStage') as number | undefined;
    if (!stage || this.time.now - this.lockHintAt < 4000) return;
    this.lockHintAt = this.time.now;
    const def = STAGES[stage - 1];
    if (!def) return;
    store.emit('event', {
      kind: 'toast',
      text: `${def.name} is locked. Read the sign next to it (E) to see how to unlock it.`,
      tone: 'warn',
    });
  }

  private prop(
    o: Phaser.Types.Tilemaps.TiledObject,
    key: string,
  ): string | number | boolean | undefined {
    return (o.properties as { name: string; value: string | number | boolean }[] | undefined)?.find(
      (p) => p.name === key,
    )?.value;
  }

  private buildObjects(): void {
    for (const o of this.map.getObjectLayer('objects')?.objects ?? []) {
      const type = o.type;
      if (type === 'sprite') {
        const key = String(this.prop(o, 'key'));
        const img = this.add.image(o.x!, o.y!, key).setOrigin(0, 1);
        img.setDepth(o.y!);
        if (key === 'prop_mailbox') this.mailbox = img;
        if (key === 'prop_box') this.box = img;
        if (key === 'prop_mat') img.setDepth(-850);
        if (this.prop(o, 'festival')) {
          this.stand.push(img);
          img.setVisible(false);
        }
        if (this.prop(o, 'pole')) this.poles.push({ x: o.x! + 8, y: o.y! - 41 });
      } else if (type === 'light') {
        const l: StaticLight = {
          x: o.x!,
          y: o.y!,
          radius: Number(this.prop(o, 'radius')),
          color: String(this.prop(o, 'color')),
          flicker: !!this.prop(o, 'flicker'),
        };
        l.glow = this.add
          .image(l.x, l.y, 'light128')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(LIGHT_COLORS[l.color] ?? 0xffae57)
          .setAlpha(0.16)
          .setScale((l.radius * 2) / 128)
          .setDepth(80_500);
        this.staticLights.push(l);
      } else if (type === 'interact') {
        const action = String(this.prop(o, 'action'));
        const rect = new Phaser.Geom.Rectangle(o.x!, o.y!, o.width!, o.height!);
        this.zones.push({
          action,
          label: String(this.prop(o, 'label') ?? action),
          rect,
          festival: !!this.prop(o, 'festival'),
        });
        this.points.zones.set(action, { x: rect.centerX, y: rect.centerY });
      } else if (type === 'npc') {
        const id = String(this.prop(o, 'npc'));
        const shadow = this.add
          .image(o.x!, o.y! + 8, 'prop_shadow')
          .setOrigin(0.5, 0.6)
          .setDepth(-760)
          .setVisible(false);
        const s = this.add.sprite(o.x!, o.y! + 8, `npc_${id}`).setOrigin(0.5, 1);
        s.play(`npc_${id}_idle_down`);
        s.setVisible(false);
        const body = this.add.zone(o.x!, o.y! + 4, 12, 8);
        this.physics.add.existing(body, true);
        this.solids.add(body);
        this.npcs.set(id, {
          id,
          sprite: s,
          shadow,
          home: { x: o.x!, y: o.y! + 8 },
          shop: this.prop(o, 'shop') as string | undefined,
          wander: !!this.prop(o, 'wander'),
          nextMove: 0,
          body,
        });
        this.points.npcs.set(id, { x: o.x!, y: o.y! });
      } else if (type === 'holocoin') {
        const s = this.add
          .sprite(o.x!, o.y!, 'holocoin')
          .play('holocoin')
          .setDepth(15 * T);
        this.tweens.add({
          targets: s,
          y: '-=3',
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Stepped',
        });
      } else if (type === 'cat') {
        this.cats.push(
          this.add
            .sprite(o.x!, o.y!, 'cat')
            .play(`cat${this.prop(o, 'coat')}`)
            .setDepth(o.y! + 20),
        );
      }
    }
  }

  /** Sagging wires between the power poles along the main road. */
  private drawPowerLines(): void {
    const g = this.add.graphics().setDepth(70_000);
    g.lineStyle(1, 0x0b0a1a, 1);
    const sorted = [...this.poles].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (b.x - a.x > 12 * T) continue;
      for (const dy of [0, 4]) {
        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(a.x, a.y + dy),
          new Phaser.Math.Vector2((a.x + b.x) / 2, Math.max(a.y, b.y) + dy + 14),
          new Phaser.Math.Vector2(b.x, b.y + dy),
        );
        curve.draw(g, 24);
      }
    }
  }

  // ------------------------------------------------------------------ intro
  /**
   * Opening shot: the camera drifts from the town down the road to the garage, then the
   * neon sign flickers on and the rigs boot one by one. Resolves when finished or skipped.
   */
  playIntro(signal: { skipped: boolean }): Promise<void> {
    this.mode = 'intro';
    const cam = this.cameras.main;
    for (const r of this.demoRigs) r.play('rig_steel_frame');
    this.neonGlow?.setAlpha(0);
    cam.centerOn(26 * T, 9 * T);
    cam.fadeIn(900, 11, 10, 26);
    // Every intro timer is tracked so starting the game can cancel the whole thing:
    // a late intro step must never pull a running game back to the title shot.
    const later = (ms: number, fn: () => void) =>
      this.introEvents.push(this.time.delayedCall(ms, fn));
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.cancelIntro();
        if (this.mode === 'intro') {
          cam.centerOn(15 * T, 29 * T);
          this.demoRigs.forEach((r) => r.play('rig_steel_mining'));
          this.neonGlow?.setAlpha(0.35);
          this.mode = 'title';
        }
        resolve();
      };
      this.introDone = done;
      const skipCheck = this.time.addEvent({
        delay: 50,
        loop: true,
        callback: () => {
          if (signal.skipped) done();
        },
      });
      this.introEvents.push(skipCheck);
      const pan = { x: 26 * T, y: 9 * T };
      this.introTween = this.tweens.add({
        targets: pan,
        x: 15 * T,
        y: 29 * T,
        duration: 4200,
        ease: 'Sine.easeInOut',
        onUpdate: () => cam.centerOn(Math.round(pan.x), Math.round(pan.y)),
        onComplete: () => {
          if (signal.skipped) return;
          // neon flicker
          const steps = [0.35, 0, 0.35, 0.1, 0.35];
          steps.forEach((a, i) => later(i * 110, () => this.neonGlow?.setAlpha(a)));
          later(500, () => sfx('power_on'));
          this.demoRigs.forEach((r, i) => {
            later(700 + i * 260, () => {
              r.play('rig_steel_booting');
              sfx('blip');
            });
            later(1300 + i * 260, () => r.play('rig_steel_mining'));
          });
          later(1300 + this.demoRigs.length * 260 + 200, done);
        },
      });
    });
  }

  /** Stops every pending intro step (camera pan, neon flicker, rig boots). */
  private cancelIntro(): void {
    for (const e of this.introEvents) e.remove(false);
    this.introEvents = [];
    this.introTween?.stop();
    this.introTween = undefined;
  }

  // ------------------------------------------------------------------ game start
  startGame(state: StateDTO): void {
    this.mode = 'play';
    // Start pressed while the intro was still playing: finish it now, quietly.
    this.cancelIntro();
    this.introDone?.();
    this.introDone = undefined;
    for (const s of this.demoRigs) s.destroy();
    this.demoRigs = [];
    this.neonGlow?.destroy();
    const spawn = this.map.getObjectLayer('objects')!.objects.find((o) => o.type === 'spawn')!;
    this.playerShadow = this.add
      .image(spawn.x!, spawn.y!, 'prop_shadow')
      .setOrigin(0.5, 0.6)
      .setDepth(-760);
    const p = this.physics.add.sprite(spawn.x!, spawn.y! + 8, 'player_body').setOrigin(0.5, 1);
    p.body!.setSize(10, 6).setOffset(3, 17);
    p.setCollideWorldBounds(true);
    this.physics.add.collider(p, this.solids, (_p, z) =>
      this.bumped(z as Phaser.GameObjects.GameObject),
    );
    this.player = p;
    this.hair = this.add.sprite(p.x, p.y, `hair_${state.farm.character.hair}`).setOrigin(0.5, 1);
    this.hat = this.add.sprite(p.x, p.y, 'hat_cap').setOrigin(0.5, 1);
    this.cameras.main.startFollow(p, true, 0.18, 0.18);
    this.syncState(state);
    this.cameras.main.fadeIn(600, 11, 10, 26);
  }

  // ------------------------------------------------------------------ state sync
  private syncState(s: StateDTO): void {
    this.lastState = s;
    if (this.mode !== 'play') return;
    this.syncScraps(s);
    const stage = s.farm.stage;
    for (const [st, zones] of this.locks)
      for (const z of zones) (z.body as Phaser.Physics.Arcade.StaticBody).enable = stage < st;
    for (const [st, g] of this.lockFx) g.setVisible(stage < st);

    if (this.hair) this.hair.setTexture(`hair_${s.farm.character.hair}`);
    if (this.hat) {
      const hat = s.farm.character.hat;
      this.hat.setVisible(hat !== 'none');
      if (hat !== 'none') this.hat.setTexture(`hat_${hat}`);
    }

    const seen = new Set<number>();
    for (const r of s.rigs) {
      seen.add(r.id);
      this.syncRig(r);
    }
    for (const [id, v] of this.rigs) if (!seen.has(id)) this.removeRig(id, v);

    this.syncTiles(
      this.coolers,
      s.coolingUnits.map((c) => ({ ...c, kind: 'cooling' as const })),
    );
    this.syncTiles(
      this.decor,
      s.decor.map((d) => ({ ...d, kind: 'decor' as const })),
    );

    // Empty slots (holograms) in unlocked fields
    const occupied = new Set([
      ...s.rigs.map((r) => `${r.x},${r.y}`),
      ...s.coolingUnits.map((c) => `${c.x},${c.y}`),
      ...s.decor.map((d) => `${d.x},${d.y}`),
    ]);
    const want = new Set<string>();
    for (const f of FIELDS) {
      if (f.stage > stage) continue;
      for (const sl of allSlots(f)) {
        const k = `${sl.x},${sl.y}`;
        if (occupied.has(k)) continue;
        want.add(k);
        if (!this.slots.has(k))
          this.slots.set(
            k,
            this.add
              .sprite(sl.x * T, sl.y * T, 'slot')
              .setOrigin(0)
              .setDepth(-850)
              .play('slot')
              .setAlpha(0.85),
          );
      }
    }
    for (const [k, sp] of this.slots)
      if (!want.has(k)) {
        sp.destroy();
        this.slots.delete(k);
      }

    this.mailbox?.setTexture(s.mail.some((m) => !m.read) ? 'prop_mailbox' : 'prop_mailbox_empty');
    this.box?.setTexture(s.farm.boxOpened ? 'prop_box_open' : 'prop_box');
    for (const o of this.stand) o.setVisible(!!s.festival);
    for (const c of this.cats) c.setVisible(stage < 4);
    if (stage >= 4 && this.drones.length === 0) {
      const f = FIELDS.find((x) => x.id === 'datacenter')!;
      for (let i = 0; i < 3; i++) {
        const d = this.add
          .sprite((f.x + 2 + i * 3) * T, (f.y - 1) * T, 'drone')
          .play('drone')
          .setDepth(70_000);
        this.tweens.add({
          targets: d,
          x: `+=${T * 2}`,
          y: `+=${T * (2 + i)}`,
          duration: 3000 + i * 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.drones.push(d);
      }
    }
    this.syncWeather(s);
    this.guideTimer = 0;
  }

  private syncRig(r: RigDTO): void {
    let v = this.rigs.get(r.id);
    const tex = `rig_${r.paint}`;
    const anim = `${tex}_${r.status}`;
    if (!v) {
      const sprite = this.add.sprite(r.x * T + 8, r.y * T + 16, tex).setOrigin(0.5, 1);
      sprite.setDepth(sprite.y);
      const body = this.addSolid(r.x * T + 2, r.y * T + 6, 12, 10);
      v = { sprite, body, key: '' };
      this.rigs.set(r.id, v);
      this.tweens.add({
        targets: sprite,
        scaleY: { from: 0.6, to: 1 },
        duration: 200,
        ease: 'Back.easeOut',
      });
    }
    if (v.key !== anim) {
      v.key = anim;
      v.sprite.play(anim);
    }
    if (r.status === 'ready' && !v.coin) {
      v.coin = this.add
        .sprite(r.x * T + 8, r.y * T - 14, 'coin')
        .play('coin')
        .setDepth(v.sprite.depth + 1);
      this.tweens.add({
        targets: v.coin,
        y: '-=3',
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
      });
    } else if (r.status !== 'ready' && v.coin) {
      v.coin.destroy();
      v.coin = undefined;
    }
    if (r.status === 'overheat' && !v.steam) {
      v.steam = this.add
        .particles(r.x * T + 8, r.y * T - 8, 'steam', {
          frame: [0, 1],
          lifespan: 900,
          speedY: { min: -18, max: -10 },
          speedX: { min: -4, max: 4 },
          alpha: { start: 0.9, end: 0 },
          frequency: 260,
        })
        .setDepth(v.sprite.depth + 2);
    } else if (r.status !== 'overheat' && v.steam) {
      v.steam.destroy();
      v.steam = undefined;
    }
    const color =
      r.status === 'overheat'
        ? STATUS_NEON.overheat
        : r.status === 'booting'
          ? STATUS_NEON.booting
          : r.status === 'mining' || r.status === 'ready'
            ? STATUS_NEON.active
            : null;
    if (color && !v.glow)
      v.glow = this.add
        .image(r.x * T + 8, r.y * T + 6, 'light64')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.18)
        .setScale(0.6)
        .setDepth(80_400);
    if (v.glow) {
      if (!color) {
        v.glow.destroy();
        v.glow = undefined;
      } else v.glow.setTint(Phaser.Display.Color.HexStringToColor(color).color);
    }
  }

  private removeRig(id: number, v: RigView): void {
    v.sprite.destroy();
    v.coin?.destroy();
    v.steam?.destroy();
    v.glow?.destroy();
    this.solids.remove(v.body, true, true);
    this.rigs.delete(id);
  }

  private syncTiles(
    map: Map<string, { sprite: Phaser.GameObjects.Sprite; body: Phaser.GameObjects.Zone }>,
    items: { x: number; y: number; itemId: string; kind: 'cooling' | 'decor' }[],
  ): void {
    const want = new Set<string>();
    for (const it of items) {
      const k = `${it.x},${it.y},${it.itemId}`;
      want.add(k);
      if (map.has(k)) continue;
      let sprite: Phaser.GameObjects.Sprite;
      if (it.kind === 'cooling') {
        const item = getItem(it.itemId);
        sprite = this.add
          .sprite(it.x * T + 8, it.y * T + 16, 'cooling')
          .setOrigin(0.5, 1)
          .play(`cooling${isCoolingUnit(item) ? item.level : 1}`);
      } else {
        sprite = this.add
          .sprite(
            it.x * T + 8,
            it.y * T + 16,
            'decor',
            Math.max(0, MANIFEST.decorOrder.indexOf(it.itemId)),
          )
          .setOrigin(0.5, 1);
      }
      sprite.setDepth(sprite.y);
      map.set(k, { sprite, body: this.addSolid(it.x * T + 3, it.y * T + 8, 10, 8) });
    }
    for (const [k, v] of map)
      if (!want.has(k)) {
        v.sprite.destroy();
        this.solids.remove(v.body, true, true);
        map.delete(k);
      }
  }

  /** Screen position (0..1 of the view) of a world point, for DOM effects. */
  private screenOf(x: number, y: number): { fx: number; fy: number } {
    const v = this.cameras.main.worldView;
    return { fx: (x - v.x) / v.width, fy: (y - v.y) / v.height };
  }

  private harvestFx(rigId: number, coins: number): void {
    const v = this.rigs.get(rigId);
    if (!v) return;
    const x = v.sprite.x;
    const y = v.sprite.y - 30;
    store.emit('coinBurst', { ...this.screenOf(x, y), label: `+${coins}`, count: 7 });
    this.cameras.main.shake(120, 0.004);
    const coin = this.add.sprite(x, y, 'coin').play('coin').setDepth(85_000);
    this.tweens.add({
      targets: coin,
      y: y - 24,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => coin.destroy(),
    });
    const sparks = this.add
      .particles(x, y, 'sparkle', {
        frame: [0, 1],
        lifespan: 600,
        speed: { min: 20, max: 50 },
        quantity: 8,
        emitting: false,
      })
      .setDepth(85_000);
    sparks.explode(10);
    this.time.delayedCall(800, () => sparks.destroy());
  }

  private syncWeather(s: StateDTO): void {
    const w = s.farm.weather;
    const kind = w === 'rainy' || w === 'storm' ? 'rain' : w === 'snow' ? 'snow' : '';
    if (kind === this.weatherKind) return;
    this.weatherKind = kind;
    this.weatherFx?.destroy();
    this.weatherFx = undefined;
    const W = this.scale.width;
    if (kind === 'rain') {
      this.weatherFx = this.add
        .particles(0, -10, 'fx_rain', {
          x: { min: -40, max: W + 40 },
          speedY: { min: 260, max: 320 },
          speedX: -40,
          lifespan: 1400,
          quantity: w === 'storm' ? 7 : 4,
          frequency: 30,
          alpha: { min: 0.55, max: 0.85 },
        })
        .setScrollFactor(0)
        .setDepth(89_000);
    } else if (kind === 'snow') {
      this.weatherFx = this.add
        .particles(0, -10, 'fx_snow', {
          x: { min: -20, max: W + 20 },
          speedY: { min: 20, max: 45 },
          speedX: { min: -12, max: 12 },
          lifespan: 9000,
          quantity: 2,
          frequency: 90,
          alpha: 0.85,
        })
        .setScrollFactor(0)
        .setDepth(89_000);
    }
    this.heat?.setAlpha(w === 'heatwave' ? 0.06 : 0);
  }

  // ------------------------------------------------------------------ loop
  override update(time: number, delta: number): void {
    const minute = this.mode === 'play' && this.lastState ? store.displayMinute() : 22 * 60;
    this.updateLighting(time, minute);
    this.fireflies!.emitting =
      nightFactor(minute) > 0.6 &&
      this.lastState?.farm.weather !== 'rainy' &&
      this.lastState?.farm.weather !== 'storm';
    if (this.mode !== 'play' || !this.player) return;
    this.updateNpcs(time);
    this.updatePlayer(delta);
    this.updateTarget();
    this.updateGuide(delta);
    this.updateLabels();
    this.twinkleScraps(time);
    this.updateHum();
    if (this.lastState?.farm.weather === 'storm' && Math.random() < 0.0015 && this.flash) {
      this.flash.setAlpha(0.35);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 250, ease: 'Stepped' });
    }
  }

  private updatePlayer(delta: number): void {
    const p = this.player!;
    const body = p.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;
    if (!store.inMenu) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;
    }
    const speed = 80;
    const len = Math.hypot(vx, vy) || 1;
    body.setVelocity((vx / len) * speed, (vy / len) * speed);
    const moving =
      (vx !== 0 || vy !== 0) && (Math.abs(body.velocity.x) > 1 || Math.abs(body.velocity.y) > 1);
    if (vx !== 0 || vy !== 0) {
      if (Math.abs(vx) > Math.abs(vy)) this.facing = vx < 0 ? 'left' : 'right';
      else if (vy !== 0) this.facing = vy < 0 ? 'up' : 'down';
    }
    if (moving) {
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) {
        sfx('step');
        this.dust?.emitParticleAt(p.x, p.y - 1, 2);
        this.stepTimer = 280;
      }
    }
    const a = moving ? 'walk' : 'idle';
    p.anims.play(`player_body_${a}_${this.facing}`, true);
    const s = this.lastState;
    if (s && this.hair) {
      this.hair.setPosition(p.x, p.y).setDepth(p.y + 0.1);
      this.hair.anims.play(`hair_${s.farm.character.hair}_${a}_${this.facing}`, true);
      this.hair.anims.setProgress(p.anims.getProgress());
    }
    if (s && this.hat?.visible) {
      this.hat.setPosition(p.x, p.y).setDepth(p.y + 0.2);
      this.hat.anims.play(`hat_${s.farm.character.hat}_${a}_${this.facing}`, true);
      this.hat.anims.setProgress(p.anims.getProgress());
    }
    p.setDepth(p.y);
    this.playerShadow?.setPosition(p.x, p.y);
  }

  shopOpen(shopId: string): boolean {
    const s = this.lastState;
    if (!s) return false;
    const shop = SHOPS[shopId as keyof typeof SHOPS];
    return !!shop && isShopOpen(shop, store.displayMinute(), calendar(s.farm.day).weekdayIndex);
  }

  private npcPresent(n: NpcView): boolean {
    const minute = store.displayMinute();
    return n.shop
      ? this.shopOpen(n.shop)
      : minute >= TOWNFOLK_HOURS.open && minute < TOWNFOLK_HOURS.close;
  }

  private updateNpcs(time: number): void {
    for (const n of this.npcs.values()) {
      const present = this.npcPresent(n);
      n.sprite.setVisible(present);
      n.shadow.setVisible(present);
      (n.body.body as Phaser.Physics.Arcade.StaticBody).enable = present;
      if (!present) continue;
      if (n.wander && !store.inMenu) {
        if (time > n.nextMove) {
          n.nextMove = time + 2500 + Math.random() * 3000;
          n.target =
            Math.random() < 0.4
              ? undefined
              : {
                  x: Phaser.Math.Clamp(n.home.x + (Math.random() - 0.5) * 120, 11 * T, 41 * T),
                  y: Phaser.Math.Clamp(n.home.y + (Math.random() - 0.5) * 60, 12 * T, 18 * T),
                };
        }
        if (n.target) {
          const dx = n.target.x - n.sprite.x;
          const dy = n.target.y - n.sprite.y;
          const d = Math.hypot(dx, dy);
          const blocked =
            this.player &&
            Math.hypot(
              this.player.x - (n.sprite.x + (dx / d) * 6),
              this.player.y - (n.sprite.y + (dy / d) * 6),
            ) < 12;
          if (d < 2 || blocked) n.target = undefined;
          else {
            n.sprite.x += (dx / d) * 0.6;
            n.sprite.y += (dy / d) * 0.6;
            const dir: Dir =
              Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
            n.sprite.anims.play(`npc_${n.id}_walk_${dir}`, true);
            n.body.setPosition(n.sprite.x, n.sprite.y - 4);
            (n.body.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
          }
        } else if (n.sprite.anims.currentAnim?.key.includes('_walk_'))
          n.sprite.anims.play(`npc_${n.id}_idle_down`, true);
      }
      n.sprite.setDepth(n.sprite.y);
      n.shadow.setPosition(n.sprite.x, n.sprite.y);
    }
  }

  // ------------------------------------------------------------------ interaction (proximity)
  /**
   * Picks the nearest interactable within reach of the player's feet — no need to face it.
   * Facing only breaks ties (things you look at win by a few pixels).
   */
  private updateTarget(): void {
    const s = this.lastState;
    const p = this.player;
    if (!s || !p) return;
    const fx = p.x;
    const fy = p.y - 4;
    const [dx, dy] = DV[this.facing];

    type Cand = {
      it: Interaction;
      rect: Phaser.Geom.Rectangle;
      prio: number;
      reach?: number;
      anchor: { x: number; y: number };
      prompt: Omit<Prompt, 'screen'>;
      tile?: { x: number; y: number };
    };
    const cands: Cand[] = [];

    for (const n of this.npcs.values()) {
      if (!n.sprite.visible) continue;
      cands.push({
        it: { kind: 'npc', npc: n.id },
        rect: new Phaser.Geom.Rectangle(n.sprite.x - 7, n.sprite.y - 10, 14, 10),
        prio: 0,
        reach: 24,
        anchor: { x: n.sprite.x, y: n.sprite.y - 26 },
        prompt: { title: NPC_NAMES[n.id] ?? n.id, action: 'Talk' },
      });
    }
    const tx0 = Math.floor(fx / T);
    const ty0 = Math.floor(fy / T);
    for (let ty = ty0 - 2; ty <= ty0 + 2; ty++)
      for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) {
        const rect = new Phaser.Geom.Rectangle(tx * T, ty * T, T, T);
        const rig = s.rigs.find((r) => r.x === tx && r.y === ty);
        if (rig) {
          const statusColor = {
            ready: '#ffd447',
            mining: '#3ff2ff',
            booting: '#ffe347',
            overheat: '#ff4558',
            broken: '#ff4558',
            off: '#8e94bf',
            installed: '#5cffab',
            frame: '#cdd2ef',
          }[rig.status];
          cands.push({
            it: { kind: 'rig', rigId: rig.id, x: tx, y: ty },
            rect,
            prio: 0,
            tile: { x: tx, y: ty },
            anchor: { x: tx * T + 8, y: ty * T - 14 },
            prompt: {
              title: `${rigName(rig.id)} · ${rig.cpuId ? (getItem(rig.cpuId)?.name ?? 'CPU') : 'No CPU'}`,
              status: {
                ready: 'Ready to claim',
                mining: `Mining ${Math.floor(rig.progress * 100)}%`,
                booting: 'Booting…',
                overheat: 'Overheat!',
                broken: 'Broken',
                off: 'No Power',
                installed: 'Powered off',
                frame: 'Needs a CPU',
              }[rig.status],
              statusColor,
              detail: `Speed ${rig.speed.toFixed(1)}/day · ${Math.round(rig.temps.total)}°C · Health ${Math.round(rig.condition)}%`,
              action: rig.status === 'ready' ? 'Claim reward' : 'Open rig',
            },
          });
          continue;
        }
        const cu = s.coolingUnits.find((c) => c.x === tx && c.y === ty);
        if (cu) {
          cands.push({
            it: { kind: 'cooling', x: tx, y: ty },
            rect,
            prio: 2,
            tile: { x: tx, y: ty },
            anchor: { x: tx * T + 8, y: ty * T - 8 },
            prompt: { title: getItem(cu.itemId)?.name ?? 'Cooling Unit', action: 'Options' },
          });
          continue;
        }
        const dc = s.decor.find((d) => d.x === tx && d.y === ty);
        if (dc) {
          cands.push({
            it: { kind: 'decor', x: tx, y: ty },
            rect,
            prio: 2,
            tile: { x: tx, y: ty },
            anchor: { x: tx * T + 8, y: ty * T - 8 },
            prompt: { title: getItem(dc.itemId)?.name ?? 'Decoration', action: 'Options' },
          });
          continue;
        }
        const slot = slotAt(tx, ty);
        if (slot && slot.field.stage <= s.farm.stage)
          cands.push({
            it: { kind: 'slot', x: tx, y: ty },
            rect,
            prio: 4,
            reach: 14,
            tile: { x: tx, y: ty },
            anchor: { x: tx * T + 8, y: ty * T },
            prompt: { title: `Empty slot · ${slot.field.name}`, action: 'Build or place' },
          });
      }
    for (const [spot, img] of this.scraps)
      cands.push({
        it: { kind: 'scrap', spot },
        rect: new Phaser.Geom.Rectangle(img.x - 8, img.y - 8, 16, 14),
        prio: 2,
        reach: 18,
        anchor: { x: img.x, y: img.y - 14 },
        prompt: { title: 'Something shiny', action: 'Search' },
      });
    for (const z of this.zones) {
      if (z.festival && !s.festival) continue;
      // The opened box is just scenery: don't let it steal E from the door and mailbox.
      if (z.action === 'box' && s.farm.boxOpened) continue;
      cands.push({
        it: { kind: 'zone', action: z.action },
        rect: z.rect,
        prio: 1,
        anchor: { x: z.rect.centerX, y: z.rect.y - 6 },
        prompt: zonePrompt(z, this, s),
      });
    }

    let best: Cand | null = null;
    let bestScore = Infinity;
    // What the objective arrow points at wins close calls, so E does what the guide says.
    const goal = this.guide.objective?.target;
    for (const c of cands) {
      let dist: number;
      let reach = c.reach ?? REACH;
      if (c.tile) {
        // Field tiles: measure from the front edge center, where you'd stand to use it.
        // This makes the slot/rig right in front of you win over a diagonal neighbor.
        dist = Math.hypot(fx - c.rect.centerX, fy - c.rect.bottom);
        reach = 22;
      } else {
        const nx = Phaser.Math.Clamp(fx, c.rect.left, c.rect.right);
        const ny = Phaser.Math.Clamp(fy, c.rect.top, c.rect.bottom);
        dist = Math.hypot(fx - nx, fy - ny);
      }
      if (dist > reach) continue;
      const toward = (c.rect.centerX - fx) * dx + (c.rect.centerY - fy) * dy > 0 ? -4 : 0;
      const guided =
        goal && Math.hypot(goal.x - c.rect.centerX, goal.y - c.rect.centerY) < 14 ? -8 : 0;
      const score = dist + c.prio * 1.5 + toward + guided;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    this.current = best?.it ?? null;
    if (best?.tile) this.marker!.setPosition(best.tile.x * T, best.tile.y * T).setVisible(true);
    else this.marker!.setVisible(false);
    if (best && !store.inMenu)
      this.keycap!.setPosition(
        Math.round(best.anchor.x),
        Math.round(best.anchor.y - 4 + (Math.floor(this.time.now / 300) % 2)),
      ).setVisible(true);
    else this.keycap!.setVisible(false);
    this.showRanges(this.current);
    if (best) {
      const v = this.cameras.main.worldView;
      this.onPrompt({
        ...best.prompt,
        screen: { fx: (best.anchor.x - v.x) / v.width, fy: (best.anchor.y - v.y) / v.height },
      });
    } else this.onPrompt(null);
  }

  /** Show the cooling coverage of the unit you're next to. */
  private showRanges(it: Interaction | null): void {
    for (const m of this.rangeMarks) m.destroy();
    this.rangeMarks = [];
    if (it?.kind !== 'cooling' || !this.lastState) return;
    const cu = this.lastState.coolingUnits.find((c) => c.x === it.x && c.y === it.y);
    const item = cu ? getItem(cu.itemId) : undefined;
    const slot = cu ? slotAt(cu.x, cu.y) : undefined;
    if (!isCoolingUnit(item) || !slot) return;
    for (const sl of allSlots(slot.field))
      if (Math.max(Math.abs(sl.col - slot.col), Math.abs(sl.row - slot.row)) <= item.radius)
        this.rangeMarks.push(
          this.add
            .image(sl.x * T, sl.y * T, 'fx_range')
            .setOrigin(0)
            .setDepth(-820),
        );
  }

  private interact(): void {
    if (this.mode !== 'play' || store.inMenu || !this.current) return;
    this.player?.setVelocity(0, 0);
    if (this.current.kind === 'npc' && this.player) {
      const n = this.npcs.get(this.current.npc!);
      if (n) {
        const ddx = this.player.x - n.sprite.x;
        const ddy = this.player.y - n.sprite.y;
        const face: Dir =
          Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 'left' : 'right') : ddy < 0 ? 'up' : 'down';
        n.sprite.anims.play(`npc_${n.id}_idle_${face}`, true);
        n.target = undefined;
        n.nextMove = this.time.now + 6000;
      }
    }
    store.emit('interact', this.current);
  }

  // ------------------------------------------------------------------ guide
  private updateGuide(delta: number): void {
    const s = this.lastState;
    if (!s || !this.player) return;
    this.guideTimer -= delta;
    if (this.guideTimer <= 0) {
      this.guideTimer = 250;
      // Wandering NPCs: point at where they are now, not where they started.
      for (const n of this.npcs.values())
        if (n.sprite.visible) this.points.npcs.set(n.id, { x: n.sprite.x, y: n.sprite.y - 8 });
      const objective = currentObjective(s, this.points, store.displayMinute(), {
        x: this.player.x,
        y: this.player.y,
      });
      const t = objective?.target;
      const distance = t
        ? Math.round(Math.hypot(t.x - this.player.x, t.y - this.player.y) / T)
        : null;
      this.guide = { objective, distance };
      this.onGuide(this.guide);
    }
    const t = this.guide.objective?.target;
    if (!t || store.inMenu) {
      this.arrow!.setVisible(false);
      this.beacon!.setVisible(false);
      this.pointer!.setVisible(false);
      return;
    }
    const near = (this.guide.distance ?? 99) <= 1;
    const bob = Math.floor(this.time.now / 250) % 2 === 0 ? 0 : -3;
    this.arrow!.setPosition(Math.round(t.x), Math.round(t.y - 22 + bob)).setVisible(
      !near || !this.current,
    );
    this.beacon!.setPosition(Math.round(t.x), Math.round(t.y + 6)).setVisible(true);

    // Off-screen pointer at the screen edge
    const v = this.cameras.main.worldView;
    const margin = 14;
    const inView = t.x > v.x + 4 && t.x < v.right - 4 && t.y > v.y + 4 && t.y < v.bottom - 4;
    if (inView) {
      this.pointer!.setVisible(false);
      return;
    }
    // Keep the pointer inside a safe box that avoids the HUD panels at the top and bottom.
    const box = { left: margin, right: v.width - margin, top: 62, bottom: v.height - 44 };
    const ox = (box.left + box.right) / 2;
    const oy = (box.top + box.bottom) / 2;
    const ang = Math.atan2(t.y - (v.y + oy), t.x - (v.x + ox));
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const kx = cos > 0 ? (box.right - ox) / cos : cos < 0 ? (box.left - ox) / cos : Infinity;
    const ky = sin > 0 ? (box.bottom - oy) / sin : sin < 0 ? (box.top - oy) / sin : Infinity;
    const k = Math.min(kx, ky);
    this.pointer!.setPosition(Math.round(ox + cos * k), Math.round(oy + sin * k))
      .setRotation(ang)
      .setVisible(true);
  }

  /** Player position as a fraction of the visible view (for HUD panels that should get out of the way). */
  playerScreen(): { fx: number; fy: number } | null {
    if (!this.player || this.mode !== 'play') return null;
    const v = this.cameras.main.worldView;
    return { fx: (this.player.x - v.x) / v.width, fy: (this.player.y - 12 - v.y) / v.height };
  }

  /** Guide target position as a fraction of the visible view, when on screen. */
  targetScreen(): { fx: number; fy: number } | null {
    const t = this.guide.objective?.target;
    if (!t || this.mode !== 'play') return null;
    const v = this.cameras.main.worldView;
    const fx = (t.x - v.x) / v.width;
    const fy = (t.y - 20 - v.y) / v.height;
    return fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 ? { fx, fy } : null;
  }

  /** Objective as last computed (for the HUD and menus). */
  currentGuide(): GuideView {
    return this.guide;
  }

  // ------------------------------------------------------------------ labels
  private updateLabels(): void {
    if (!this.player || store.inMenu) {
      this.onLabels([]);
      return;
    }
    const v = this.cameras.main.worldView;
    const out: WorldLabel[] = [];
    for (const n of this.npcs.values()) {
      if (!n.sprite.visible) continue;
      const d = Math.hypot(n.sprite.x - this.player.x, n.sprite.y - this.player.y);
      if (d > 90 || this.current?.npc === n.id) continue;
      out.push({
        text: NPC_NAMES[n.id] ?? n.id,
        fx: (n.sprite.x - v.x) / v.width,
        fy: (n.sprite.y - 27 - v.y) / v.height,
      });
    }
    this.onLabels(out);
  }

  private updateHum(): void {
    const s = this.lastState;
    if (!s || !this.player) return;
    let total = 0;
    for (const r of s.rigs) {
      if (r.status !== 'mining' && r.status !== 'ready' && r.status !== 'overheat') continue;
      total += Math.max(
        0,
        1 - Math.hypot(r.x * T + 8 - this.player.x, r.y * T + 8 - this.player.y) / 180,
      );
    }
    setHum(total / 3);
  }

  // ------------------------------------------------------------------ lighting
  private updateLighting(time: number, minute: number): void {
    const s = this.lastState;
    const nf = nightFactor(minute);
    const weatherDim = s && (s.farm.weather === 'storm' || s.farm.weather === 'rainy') ? 0.08 : 0;
    const alpha = Math.min(0.78, 0.08 + nf * 0.62 + weatherDim);
    this.vignette?.setAlpha(0.2 + nf * 0.4);
    const view = this.cameras.main.worldView;
    const rt = this.overlay;
    rt.clear();
    rt.fill(0x0b0a1a, alpha);
    const stamp = (x: number, y: number, radius: number) => {
      const sx = x - view.x;
      const sy = y - view.y;
      if (sx < -radius || sy < -radius || sx > view.width + radius || sy > view.height + radius)
        return;
      const size = radius > 48 ? 128 : radius > 20 ? 64 : 32;
      const img = this.lightImg[size]!;
      img.setScale((radius * 2) / size);
      rt.erase(img, Math.round(sx), Math.round(sy));
    };
    const lampsOn = nf > 0.3;
    for (const l of this.staticLights) {
      const on = l.color !== 'warm' || lampsOn;
      l.glow?.setVisible(on && nf > 0.2);
      if (!on) continue;
      const flick = l.flicker ? (Math.sin(time / 130 + l.x) > 0.96 ? 0.85 : 1) : 1;
      stamp(l.x, l.y, l.radius * flick);
    }
    if (s && this.mode === 'play') {
      for (const r of s.rigs)
        if (
          r.status === 'mining' ||
          r.status === 'ready' ||
          r.status === 'overheat' ||
          r.status === 'booting'
        )
          stamp(r.x * T + 8, r.y * T + 6, 22);
      if (this.player) stamp(this.player.x, this.player.y - 10, 34);
      // Shiny scraps glow a little so they can be spotted at night too.
      for (const g of this.scraps.values()) stamp(g.x, g.y, 12);
    } else {
      for (const d of this.demoRigs)
        if (d.anims.currentAnim?.key !== 'rig_steel_frame') stamp(d.x, d.y - 10, 22);
      if ((this.neonGlow?.alpha ?? 0) > 0.2) stamp(7.5 * T, 26.6 * T, 40);
    }
  }
}

function zonePrompt(z: Zone, scene: WorldScene, s: StateDTO): Omit<Prompt, 'screen'> {
  const a = z.action;
  if (a === 'sleep')
    return {
      title: 'Your garage',
      detail: 'Sleep until 6:00 AM. Rigs keep working.',
      action: 'Go to bed',
    };
  if (a === 'mailbox')
    return {
      title: 'Mailbox',
      status: s.mail.some((m) => !m.read) ? 'New mail!' : undefined,
      statusColor: '#ff52dc',
      action: 'Read mail',
    };
  if (a === 'box')
    return { title: "Uncle Ray's box", action: s.farm.boxOpened ? 'Look inside' : 'Open' };
  if (a === 'market')
    return {
      title: 'Market Board',
      detail: 'Sell parts, buy at today’s prices.',
      action: 'Check prices',
    };
  if (a === 'statue') return { title: 'Coin statue', action: 'Look' };
  if (a === 'festival')
    return { title: s.festival?.name ?? 'Festival', action: 'Join the festival' };
  if (a.startsWith('shop:')) {
    const id = a.slice(5);
    const open = scene.shopOpen(id);
    return {
      title: z.label,
      status: open ? 'Open' : 'Closed',
      statusColor: open ? '#5cffab' : '#ff4558',
      action: open ? 'Enter' : 'Check hours',
    };
  }
  if (a.startsWith('gate:')) {
    const st = Number(a.slice(5));
    const unlocked = s.farm.stage >= st;
    return {
      title: ['', '', 'Backyard', 'Warehouse Bay', 'Data Center'][st] ?? 'Gate',
      status: unlocked ? 'Unlocked' : 'Locked',
      statusColor: unlocked ? '#5cffab' : '#ffe347',
      action: unlocked ? 'Read sign' : 'See requirements',
    };
  }
  return { title: z.label, action: 'Interact' };
}
