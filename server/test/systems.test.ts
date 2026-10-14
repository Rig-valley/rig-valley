/** Engine-level tests for rigs, power, shops, friendship and progression. */
import { describe, expect, it } from 'vitest';
import {
  SCRAP_SET_BONUS,
  SCRAP_SPOTS,
  getItem,
  isCpu,
  newRig,
  scrapFind,
  scrapSpotsFor,
  type GameEvent,
} from '@rig-valley/shared';
import { openDb } from '../src/db/index.js';
import { DEFAULT_GAME_CONFIG } from '../src/configStore.js';
import { applyAction } from '../src/game/actions.js';
import { sleep } from '../src/game/overnight.js';
import { addQuest, pickDailyQuest } from '../src/game/quests.js';
import { defaultFlags, type FarmState } from '../src/game/state.js';
import type { EngineCtx } from '../src/game/helpers.js';

function farm(over: Partial<FarmState['farm']> = {}): FarmState {
  return {
    farm: {
      id: 1,
      address: '0x0',
      farmName: 'Test',
      character: { name: 'T', hair: 'ink', hat: 'none' },
      stage: 1,
      energy: 100,
      coins: 10_000,
      day: 1,
      minute: 12 * 60,
      paused: false,
      lastTickAt: null,
      weather: 'sunny',
      weatherTomorrow: 'sunny',
      powerUpgrades: [],
      powerKwh: 0,
      tutorialStep: 7,
      harvestCount: 100,
      flags: { ...defaultFlags(1, 'none'), boxOpened: true },
      ...over,
    },
    rigs: [],
    coolingUnits: [],
    decor: [],
    inventory: new Map(),
    relations: new Map(['mia', 'bo', 'dex', 'vera', 'kai'].map((n) => [n as 'mia', 0])),
    quests: [],
    mail: [],
    pendingUnits: 0n,
    backlogUsd: 0,
    newMail: [],
    deletedMail: [],
    ledger: [],
    harvests: [],
    _orig: undefined as never,
  };
}

let nextId = 100;
function ctx(events: GameEvent[] = []): EngineCtx {
  return {
    q: { query: async () => ({ rows: [{ id: nextId++ }] as never[] }) },
    now: Date.now(),
    config: DEFAULT_GAME_CONFIG,
    price: async () => ({ price: 200, at: Date.now(), source: 'test' }),
    decimals: 18,
    events,
  };
}

function running(id: number, x: number, y: number) {
  const r = newRig(id, x, y, 'frame_t1');
  r.cpuId = 'cpu_common';
  r.powered = true;
  return r;
}

describe('power', () => {
  it('trips the breaker overnight when over capacity, and rigs stop', async () => {
    const s = farm();
    for (let i = 0; i < 6; i++) s.rigs.push(running(i + 1, 17 + i, 31));
    s.coolingUnits.push(
      { x: 17, y: 33, itemId: 'cooling_lv1' },
      { x: 20, y: 33, itemId: 'cooling_lv1' },
    );
    s.rigs.push(running(7, 17, 35)); // 7 × 80 W + 30 W > 500 W
    const events: GameEvent[] = [];
    sleep(s, ctx(events), false);
    const summary = events.find((e) => e.kind === 'sleep');
    expect(summary && summary.kind === 'sleep' && summary.summary.tripped).toBe(true);
    expect(s.rigs.every((r) => r.progress === 0)).toBe(true);
    expect(s.newMail.some((m) => m.templateId === 'breaker_tripped')).toBe(true);
  });

  it('bills power weekly on Monday mornings', () => {
    const s = farm({ day: 7, powerKwh: 100 });
    const events: GameEvent[] = [];
    sleep(s, ctx(events), false);
    expect(s.farm.day).toBe(8);
    expect(s.farm.coins).toBe(10_000 - 200);
    expect(s.farm.powerKwh).toBe(0);
  });

  it('passes out at 2 AM with half energy and a fee', () => {
    const s = farm({ minute: 26 * 60 });
    sleep(s, ctx(), true);
    expect(s.farm.energy).toBe(50);
    expect(s.farm.coins).toBe(10_000 - 30);
  });
});

describe('rig actions', () => {
  it('builds rigs only on unlocked slots, up to the stage limit', async () => {
    const s = farm();
    s.inventory.set('frame_t1', 10);
    await applyAction(s, ctx(), { type: 'build_rig', x: 17, y: 31, frameId: 'frame_t1' });
    expect(s.rigs).toHaveLength(1);
    await expect(
      applyAction(s, ctx(), { type: 'build_rig', x: 17, y: 32, frameId: 'frame_t1' }),
    ).rejects.toThrow(/can't place/);
    await expect(
      applyAction(s, ctx(), { type: 'build_rig', x: 17, y: 40, frameId: 'frame_t1' }),
    ).rejects.toThrow(/isn't unlocked/);
    for (let i = 1; i < 6; i++)
      await applyAction(s, ctx(), { type: 'build_rig', x: 17 + i, y: 31, frameId: 'frame_t1' });
    await expect(
      applyAction(s, ctx(), { type: 'build_rig', x: 17, y: 33, frameId: 'frame_t1' }),
    ).rejects.toThrow(/6 rigs/);
  });

  it('refuses parts above the frame tier and charges energy', async () => {
    const s = farm();
    s.rigs.push(newRig(1, 17, 31, 'frame_t1'));
    s.inventory.set('cpu_rare', 1);
    await expect(
      applyAction(s, ctx(), { type: 'install', rigId: 1, itemId: 'cpu_rare' }),
    ).rejects.toThrow(/Upgrade the frame/);
    s.farm.energy = 5;
    s.inventory.set('cpu_common', 1);
    await expect(
      applyAction(s, ctx(), { type: 'install', rigId: 1, itemId: 'cpu_common' }),
    ).rejects.toThrow(/too tired/);
  });

  it('overheated rigs need service before switching on again', async () => {
    const s = farm();
    const r = running(1, 17, 31);
    r.overheat = true;
    r.powered = false;
    s.rigs.push(r);
    s.inventory.set('cloth', 1);
    await expect(applyAction(s, ctx(), { type: 'power', rigId: 1, on: true })).rejects.toThrow(
      /Too hot/,
    );
    await applyAction(s, ctx(), { type: 'clean', rigId: 1 });
    await applyAction(s, ctx(), { type: 'power', rigId: 1, on: true });
    expect(r.powered).toBe(true);
  });

  it('harvest pays coins and NVDA, never from quests or events', async () => {
    const s = farm();
    const r = running(1, 17, 31);
    r.progress = 1;
    s.rigs.push(r);
    const events: GameEvent[] = [];
    await applyAction(s, ctx(events), { type: 'claim', rigId: 1 });
    const cpu = getItem('cpu_common');
    expect(s.farm.coins).toBe(10_000 + (isCpu(cpu) ? cpu.coins : NaN));
    // normal rate $0.02 at $200
    expect(s.pendingUnits).toBe(100_000_000_000_000n);
    const before = s.pendingUnits;
    addQuest(s, 'main_room_to_grow');
    await applyAction(s, ctx(), { type: 'talk', npc: 'mia' });
    expect(s.pendingUnits).toBe(before);
  });
});

describe('town', () => {
  it('respects shop hours and stage stock', async () => {
    const s = farm({ minute: 7 * 60 });
    await expect(
      applyAction(s, ctx(), { type: 'buy', shopId: 'hardware', itemId: 'thermal_paste', qty: 1 }),
    ).rejects.toThrow(/closed/);
    s.farm.minute = 10 * 60;
    await applyAction(s, ctx(), {
      type: 'buy',
      shopId: 'hardware',
      itemId: 'thermal_paste',
      qty: 3,
    });
    expect(s.inventory.get('thermal_paste')).toBe(3);
    await expect(
      applyAction(s, ctx(), { type: 'buy', shopId: 'hardware', itemId: 'cpu_rare', qty: 1 }),
    ).rejects.toThrow(/isn't for sale/);
  });

  it('sells on the Market Board for less than buying', async () => {
    const s = farm();
    s.inventory.set('cpu_common', 1);
    await applyAction(s, ctx(), { type: 'sell', itemId: 'cpu_common', qty: 1 });
    expect(s.farm.coins).toBeGreaterThan(10_000);
    expect(s.farm.coins).toBeLessThan(10_000 + 120);
  });

  it('gifts raise friendship once a day and level-ups unlock relationship quests', async () => {
    const s = farm();
    s.relations.set('mia', 180);
    s.inventory.set('vintage_gpu', 2);
    const events: GameEvent[] = [];
    await applyAction(s, ctx(events), { type: 'gift', npc: 'mia', itemId: 'vintage_gpu' });
    expect(s.relations.get('mia')).toBe(230);
    expect(events.some((e) => e.kind === 'level_up' && e.level === 2)).toBe(true);
    expect(s.quests.some((q) => q.questId === 'rel_mia_shelf_help')).toBe(true);
    await expect(
      applyAction(s, ctx(), { type: 'gift', npc: 'mia', itemId: 'vintage_gpu' }),
    ).rejects.toThrow(/already/);
  });
});

describe('progression', () => {
  it('unlocks the backyard once the story quest, rigs and coins line up', async () => {
    const s = farm();
    await expect(applyAction(s, ctx(), { type: 'unlock_stage', stage: 2 })).rejects.toThrow(
      /Finish/,
    );
    addQuest(s, 'main_room_to_grow');
    for (let i = 0; i < 3; i++) s.rigs.push(running(i + 1, 17 + i, 31));
    await applyAction(s, ctx(), { type: 'talk', npc: 'bo' }); // triggers quest refresh
    expect(s.quests.find((q) => q.questId === 'main_room_to_grow')?.state).toBe('done');
    await applyAction(s, ctx(), { type: 'unlock_stage', stage: 2 });
    expect(s.farm.stage).toBe(2);
    expect(s.quests.some((q) => q.questId === 'main_cold_river')).toBe(true);
    await expect(applyAction(s, ctx(), { type: 'unlock_stage', stage: 4 })).rejects.toThrow();
  });

  it('runs a seasonal festival once a day with item prizes only', async () => {
    const s = farm({ day: 14 });
    for (let i = 0; i < 3; i++) s.rigs.push(running(i + 1, 17 + i * 2, 31));
    await applyAction(s, ctx(), { type: 'festival_join' });
    expect(s.inventory.get('decor_ribbon')).toBe(1);
    expect(s.pendingUnits).toBe(0n);
    await expect(applyAction(s, ctx(), { type: 'festival_join' })).rejects.toThrow(/already/);
  });
});

describe('shiny scraps', () => {
  it('pays each spot once, rejects other spots, and gives a set bonus', async () => {
    const s = farm({ day: 5 });
    const spots = scrapSpotsFor(s.farm.id, s.farm.day);
    const other = SCRAP_SPOTS.findIndex((_, i) => !spots.includes(i));
    await expect(applyAction(s, ctx([]), { type: 'scavenge', spot: other })).rejects.toThrow();
    let coins = s.farm.coins;
    for (const spot of spots) {
      const find = scrapFind(s.farm.id, s.farm.day, spot);
      await applyAction(s, ctx([]), { type: 'scavenge', spot });
      if ('coins' in find) coins += find.coins;
    }
    expect(s.farm.coins).toBe(coins + SCRAP_SET_BONUS);
    await expect(applyAction(s, ctx([]), { type: 'scavenge', spot: spots[0]! })).rejects.toThrow();
  });

  it('coffee rush tips perfect orders, capped by the score', async () => {
    const s = farm({ minute: 9 * 60 });
    const before = s.farm.coins;
    await applyAction(s, ctx([]), { type: 'minigame', game: 'coffee_rush', score: 5, perfect: 99 });
    expect(s.farm.coins - before).toBe(5 * 4 + 5 * 2);
  });
});

describe('daily jobs', () => {
  it('never hands out a job that cannot be done today', () => {
    for (let day = 2; day < 60; day++) {
      const s = farm({ day });
      // Spotless, fresh rigs early in their cycle: cleaning, repasting and harvests are impossible.
      for (let i = 1; i <= 3; i++) {
        const r = running(i, 16 + i, 31);
        r.dust = 0;
        r.paste = 100;
        r.progress = 0.1;
        s.rigs.push(r);
      }
      const goal = pickDailyQuest(s).goals[0]!;
      expect(['talk', 'deliver']).toContain(goal.type);
    }
  });
});

describe('database', () => {
  it('migrates cleanly', async () => {
    const db = await openDb({ pgliteDir: 'memory' });
    const r = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM items');
    expect(r.rows[0]!.n).toBeGreaterThan(40);
    await db.close();
  });
});
