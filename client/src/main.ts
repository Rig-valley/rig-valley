/** Rig Valley client entry: boots Phaser, the DOM UI and the onboarding flow. */
// Tiny5: a chunky pixel font whose C/O, c/o and 2/5/8 are unmistakable at UI sizes.
import '@fontsource/tiny5/400.css';
import { loadDigitFont } from './digits';
import './styles.css';
import Phaser from 'phaser';
import type { Interaction } from './store';
import { store } from './store';
import { api, ApiError } from './api';
import { BootScene } from './game/BootScene';
import { WorldScene } from './game/WorldScene';
import { Hud } from './ui/hud';
import { anyModal, closeTop } from './ui/modal';
import {
  accountScreen,
  farmSetupScreen,
  hideScreen,
  messageScreen,
  storyOpener,
  titleScreen,
} from './ui/screens';
import { openPlacedMenu, openRigMenu, openSlotMenu } from './ui/menus/rig';
import { openMarket, openShop } from './ui/menus/shop';
import { openFriends, openNpc } from './ui/menus/people';
import { openInventory, openMail, openQuests } from './ui/menus/journal';
import { openRewards } from './ui/menus/rewards';
import { openSettings } from './ui/menus/settings';
import {
  openBox,
  openFestival,
  openGate,
  openSleep,
  openStatue,
  showMorning,
} from './ui/menus/world';
import { maybeShowHowToPlay } from './ui/menus/help';
import { setupChain } from './wallet/wallet';
import { setSessionAddress } from './wallet/session';
import { getItem, isFood, type NpcId, type ShopId, type StateDTO } from '@rig-valley/shared';
import { sfx } from './audio';

const DEV_BACKGROUND = import.meta.env.DEV && new URLSearchParams(location.search).has('bg');
const BASE_W = 640;
const BASE_H = 360;

function fitUi(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
  const frame = document.getElementById('ui-frame')!;
  const ui = document.getElementById('ui')!;
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  frame.style.left = `${r.left}px`;
  frame.style.top = `${r.top}px`;
  frame.style.width = `${r.width}px`;
  frame.style.height = `${r.height}px`;
  // Never shrink the UI below its real size (text stays sharp and readable); on big
  // screens zoom up in quarter steps so it keeps its proportions to the game.
  const zoom = Math.max(1, Math.floor(Math.min(r.width / 1280, r.height / 720) * 4) / 4);
  ui.style.zoom = String(zoom);
  ui.style.width = `${r.width / zoom}px`;
  ui.style.height = `${r.height / zoom}px`;
}

function boot(): Promise<WorldScene> {
  return new Promise((resolve) => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: BASE_W,
      height: BASE_H,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#0b0a1a',
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [BootScene, WorldScene],
      input: { keyboard: { target: window } },
      // Dev only: ?bg=1 keeps the game running in a hidden tab (automated testing).
      fps: DEV_BACKGROUND ? { forceSetTimeOut: true, target: 30 } : undefined,
    });
    if (DEV_BACKGROUND) {
      game.events.once(Phaser.Core.Events.READY, () => {
        game.events.off(Phaser.Core.Events.HIDDEN);
        game.events.off(Phaser.Core.Events.BLUR);
      });
    }
    if (import.meta.env.DEV) (window as unknown as { __rv: unknown }).__rv = { game, store };
    game.scale.on('resize', fitUi);
    window.addEventListener('resize', fitUi);
    game.events.on('poststep', () => {});
    const check = () => {
      const w = game.scene.getScene('world') as WorldScene | null;
      if (w && w.sys.isActive() && w.children) {
        fitUi();
        resolve(w);
      } else setTimeout(check, 50);
    };
    check();
  });
}

function wireGame(world: WorldScene, hud: Hud): void {
  world.onPrompt = (p) => hud.showPrompt(store.inMenu ? null : p);
  world.onLabels = (l) => hud.showLabels(l);
  world.onGuide = (g) => hud.showGuide(g);

  store.on('interact', (it: Interaction) => {
    sfx('blip');
    switch (it.kind) {
      case 'rig': {
        const rig = store.state?.rigs.find((r) => r.id === it.rigId);
        if (rig?.status === 'ready') void store.act({ type: 'claim', rigId: rig.id });
        else if (it.rigId) openRigMenu(it.rigId);
        break;
      }
      case 'slot':
        openSlotMenu(it.x!, it.y!);
        break;
      case 'scrap':
        void store.act({ type: 'scavenge', spot: it.spot! });
        break;
      case 'cooling':
      case 'decor':
        openPlacedMenu(it.kind, it.x!, it.y!);
        break;
      case 'npc':
        void openNpc(it.npc as NpcId);
        break;
      case 'zone': {
        const a = it.action ?? '';
        if (a === 'sleep') void openSleep();
        else if (a === 'mailbox') openMail();
        else if (a === 'box') void openBox();
        else if (a === 'market') void openMarket();
        else if (a === 'statue') openStatue();
        else if (a === 'festival') openFestival();
        else if (a.startsWith('shop:')) openShop(a.slice(5) as ShopId);
        else if (a.startsWith('gate:')) openGate(Number(a.slice(5)));
        break;
      }
    }
  });

  store.on('event', (e) => {
    if (e.kind === 'sleep') showMorning(e.summary);
  });

  window.addEventListener('keydown', (e) => {
    if (world.mode !== 'play') return;
    const typing = e.target instanceof Element && e.target.closest('input, textarea, select');
    if (e.key === 'Escape') {
      if (!closeTop() && !anyModal()) void openSettings();
      e.preventDefault();
      return;
    }
    if (typing || anyModal()) return;
    const k = e.key.toLowerCase();
    if (k === 'i') openInventory();
    else if (k === 'j') openQuests();
    else if (k === 'm') openMail();
    else if (k === 'f') openFriends();
    else if (k === 'r') void openRewards();
  });
}

async function enterGame(world: WorldScene, state: StateDTO): Promise<void> {
  hideScreen();
  const hud = new Hud({
    openInventory: () => openInventory(),
    openQuests,
    openMail: () => openMail(),
    openRewards: () => void openRewards(),
    openFriends,
    openSettings: () => void openSettings(),
    useItem: (itemId) => {
      const it = store.state?.inventory.find((i) => i.itemId === itemId);
      if (!it) return;
      if (isFood(getItem(itemId))) void store.act({ type: 'eat', itemId });
      else openInventory();
    },
  });
  hud.playerScreen = () => world.playerScreen();
  hud.targetScreen = () => world.targetScreen();
  wireGame(world, hud);
  hud.mount();
  store.setState(state);
  world.startGame(state);
  store.start();
  fitUi();
  await maybeShowHowToPlay();
}

/** Rides out a brief server hiccup (restart, flaky Wi-Fi) before giving up. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

async function main(): Promise<void> {
  await Promise.all([loadDigitFont(), document.fonts.load('16px "Tiny5"').catch(() => undefined)]);
  const world = await boot();
  document.getElementById('boot-loader')?.remove();
  let captchaSiteKey: string | null = null;
  try {
    const pub = await withRetry(() => api.publicConfig());
    setupChain(pub);
    captchaSiteKey = pub.captchaSiteKey ?? null;
  } catch {
    messageScreen(
      "Can't reach Rig Valley",
      "The game server isn't responding. Check your connection and reload.",
      { label: 'Reload', fn: () => location.reload() },
    );
    return;
  }
  await titleScreen(world);

  let me = await api.me().catch(() => null);
  if (!me) me = await accountScreen();
  setSessionAddress(me.address);

  let state: StateDTO;
  if (me.hasFarm) {
    try {
      state = await api.state();
    } catch (e) {
      messageScreen('Hmm', e instanceof ApiError ? e.message : 'Could not load your farm.', {
        label: 'Reload',
        fn: () => location.reload(),
      });
      return;
    }
  } else {
    state = await farmSetupScreen(captchaSiteKey);
    await storyOpener(state);
    // Reading Ray's letter is the first tutorial step.
    const letter = state.mail.find((m) => m.templateId === 'ray_welcome');
    if (letter) {
      const r = await api.act({ type: 'read_mail', mailId: letter.id }).catch(() => null);
      if (r) state = r.state;
    }
  }
  await enterGame(world, state);
}

void main();
