/** Engine-level tests for rigs, power, shops, friendship and progression. */
import { describe, expect, it } from 'vitest';
import {
  COFFEE_RUSH_COUNTDOWN_MS,
  SCRAP_SET_BONUS,
  SCRAP_SPOTS,
  coffeeRushOrders,
  getItem,
  playCoffeeRush,
  type RushKey,
  type RushPress,
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
      createdAt: Date.now(),
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
function ctx(events: GameEvent[] = [], now = Date.now(), config = DEFAULT_GAME_CONFIG): EngineCtx {
  return {
    q: { query: async () => ({ rows: [{ id: nextId++ }] as never[] }) },
    now,
    config,
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
});

describe('coffee rush', () => {
  /** Press every arrow of the first `n` orders correctly, `gap` ms apart; slip on `slipOn`. */
  function play(seed: number, n: number, gap = 150, slipOn: number[] = []): RushPress[] {
    const presses: RushPress[] = [];
    let t = 200;
    coffeeRushOrders(seed)
      .slice(0, n)
      .forEach((order, i) => {
        if (slipOn.includes(i)) presses.push([((order[0]! + 1) % 4) as RushKey, (t += gap)]);
        for (const k of order) presses.push([k, (t += gap)]);
      });
    return presses;
  }

  it('pays for the shift the server replays, not a claimed score', async () => {
    const s = farm({ minute: 9 * 60 });
    const t0 = Date.now();
    await applyAction(s, ctx([], t0), { type: 'minigame_start', game: 'coffee_rush' });
    expect(s.farm.energy).toBe(95);
    const rush = s.farm.flags.daily.rush!;
    const presses = play(rush.seed, 5, 150, [1]);
    const before = s.farm.coins;
    const end = t0 + COFFEE_RUSH_COUNTDOWN_MS + presses.at(-1)![1] + 100;
    await applyAction(s, ctx([], end), { type: 'minigame', game: 'coffee_rush', presses });
    // 5 drinks × 4, tips for the 4 without a slip × 2.
    expect(s.farm.coins - before).toBe(5 * 4 + 4 * 2);
    // Paid once.
    await expect(
      applyAction(s, ctx([], end), { type: 'minigame', game: 'coffee_rush', presses }),
    ).rejects.toThrow(/start a shift/);
    await expect(
      applyAction(s, ctx([], end), { type: 'minigame_start', game: 'coffee_rush' }),
    ).rejects.toThrow(/one shift a day/);
  });

  it('refuses a shift handed in faster than it could be played', async () => {
    const s = farm({ minute: 9 * 60 });
    const t0 = Date.now();
    await applyAction(s, ctx([], t0), { type: 'minigame_start', game: 'coffee_rush' });
    const presses = play(s.farm.flags.daily.rush!.seed, 10);
    await expect(
      applyAction(s, ctx([], t0 + 500), { type: 'minigame', game: 'coffee_rush', presses }),
    ).rejects.toThrow(/didn't see you/);
    // Out-of-order timestamps are refused too.
    const shuffled: RushPress[] = [presses[1]!, presses[0]!, ...presses.slice(2)];
    await expect(
      applyAction(s, ctx([], t0 + 60_000), {
        type: 'minigame',
        game: 'coffee_rush',
        presses: shuffled,
      }),
    ).rejects.toThrow(/order slip/);
    // Long after the shift: forfeited.
    await expect(
      applyAction(s, ctx([], t0 + 11 * 60_000), { type: 'minigame', game: 'coffee_rush', presses }),
    ).rejects.toThrow(/long over/);
  });

  it('ignores presses after the 30-second shift', async () => {
    const s = farm({ minute: 9 * 60 });
    const t0 = Date.now();
    await applyAction(s, ctx([], t0), { type: 'minigame_start', game: 'coffee_rush' });
    // Ten perfect orders, but slow: only those finished within 30 s count.
    const seed = s.farm.flags.daily.rush!.seed;
    const presses = play(seed, 10, 1_000);
    const inTime = presses.filter(([, t]) => t <= 30_000).length;
    const orders = coffeeRushOrders(seed);
    let n = 0;
    for (let used = 0; n < orders.length && used + orders[n]!.length <= inTime; n++)
      used += orders[n]!.length;
    expect(playCoffeeRush(seed, presses)).toEqual({ score: n, perfect: n });
    const before = s.farm.coins;
    await applyAction(s, ctx([], t0 + 40_000), { type: 'minigame', game: 'coffee_rush', presses });
    expect(s.farm.coins - before).toBe(n * 4 + n * 2);
    expect(n).toBeLessThan(10);
  });
});

describe('bedtime', () => {
  it('only lets the player sleep at night, or from 2 PM when worn out', async () => {
    const s = farm({ day: 3, minute: 12 * 60 });
    await expect(applyAction(s, ctx(), { type: 'sleep' })).rejects.toThrow(/too early/);
    s.farm.minute = 14 * 60;
    await expect(applyAction(s, ctx(), { type: 'sleep' })).rejects.toThrow(/too early/);
    s.farm.energy = 30;
    await applyAction(s, ctx(), { type: 'sleep' });
    expect(s.farm.day).toBe(4);
    // A few game minutes of grace for the browser clock running ahead.
    s.farm.minute = 19 * 60 + 49;
    await expect(applyAction(s, ctx(), { type: 'sleep' })).rejects.toThrow(/too early/);
    s.farm.minute = 20 * 60;
    await applyAction(s, ctx(), { type: 'sleep' });
    expect(s.farm.day).toBe(5);
  });

  it('lets a new farmer sleep anytime on day 1 (the tutorial night)', async () => {
    const s = farm({ day: 1, minute: 6 * 60 + 10 });
    await applyAction(s, ctx(), { type: 'sleep' });
    expect(s.farm.day).toBe(2);
  });
});

describe('daily NVDA limit', () => {
  it('pays Coins only past the limit, keeps the boost, and resets the next UTC day', async () => {
    const config = {
      ...DEFAULT_GAME_CONFIG,
      rewards: { ...DEFAULT_GAME_CONFIG.rewards, dailyNvdaHarvests: 2 },
    };
    const s = farm({ harvestCount: 0 });
    const r = running(1, 17, 31);
    s.rigs.push(r);
    const day1 = Date.UTC(2026, 9, 15, 23, 0);
    const claim = async (now: number) => {
      const events: GameEvent[] = [];
      r.progress = 1;
      await applyAction(s, ctx(events, now, config), { type: 'claim', rigId: 1 });
      return events.find((e) => e.kind === 'harvest')!;
    };
    expect(await claim(day1)).toMatchObject({ usd: 0.08, boosted: true });
    expect(await claim(day1)).toMatchObject({ usd: 0.08, boosted: true });
    const pending = s.pendingUnits;
    const coins = s.farm.coins;
    const capped = await claim(day1 + 60_000);
    expect(capped).toMatchObject({ usd: 0, boosted: false, capped: true, nvdaUnits: '0' });
    expect(s.pendingUnits).toBe(pending);
    expect(s.farm.coins).toBeGreaterThan(coins); // Coins still paid
    expect(s.farm.harvestCount).toBe(3);
    // After midnight UTC: NVDA again, and the boost wasn't used up by the capped harvest.
    expect(await claim(day1 + 2 * 3_600_000)).toMatchObject({ usd: 0.08, boosted: true });
    expect(s.farm.harvestCount - s.farm.flags.coinOnlyHarvests).toBe(3);
  });
});

describe('power bill debt', () => {
  it('cuts the power after two short bills, and paying it off restores it', async () => {
    // Day 7 (Sunday) → day 8 is Monday: bill day.
    const s = farm({ day: 7, minute: 22 * 60, coins: 0, powerKwh: 100 });
    const r = running(1, 17, 31);
    s.rigs.push(r);
    sleep(s, ctx(), false);
    expect(s.farm.flags.unpaidBills).toBe(1);
    expect(s.farm.flags.powerCut).toBe(false);
    const firstDebt = s.farm.flags.billDebt;
    expect(firstDebt).toBeGreaterThan(0);
    expect(s.newMail.find((m) => m.templateId === 'power_bill')?.params.unpaid).toBe(firstDebt);

    // A week later, still broke: Vera cuts the power.
    s.farm.day = 14;
    s.farm.minute = 22 * 60;
    const events: GameEvent[] = [];
    sleep(s, ctx(events), false);
    const owed = s.farm.flags.billDebt;
    expect(owed).toBeGreaterThan(firstDebt);
    expect(s.farm.flags.powerCut).toBe(true);
    expect(r.powered).toBe(false);
    expect(s.newMail.some((m) => m.templateId === 'power_cut')).toBe(true);
    const summary = events.find((e) => e.kind === 'sleep');
    expect(summary?.kind === 'sleep' && summary.summary.powerCut).toBe(true);
    expect(s.newMail.find((m) => m.templateId === 'power_bill' && m.params.cut === 1)).toBeTruthy();
    s.farm.minute = 10 * 60;
    await expect(applyAction(s, ctx(), { type: 'power', rigId: 1, on: true })).rejects.toThrow(
      /cut your power/,
    );

    // Another short bill while cut off: still cut, no second cut-off letter.
    s.newMail = [];
    s.farm.day = 21;
    s.farm.minute = 22 * 60;
    sleep(s, ctx(), false);
    expect(s.farm.flags.powerCut).toBe(true);
    expect(s.newMail.find((m) => m.templateId === 'power_bill')?.params.cut).toBe(2);
    expect(s.newMail.some((m) => m.templateId === 'power_cut')).toBe(false);
    s.farm.minute = 10 * 60;

    // Pay part, then the rest: power comes back.
    s.farm.coins = 10;
    await applyAction(s, ctx(), { type: 'pay_bill' });
    expect(s.farm.flags.billDebt).toBe(owed - 10);
    expect(s.farm.coins).toBe(0);
    expect(s.farm.flags.powerCut).toBe(true);
    s.farm.coins = 100_000;
    await applyAction(s, ctx(), { type: 'pay_bill' });
    expect(s.farm.coins).toBe(100_000 - (owed - 10));
    expect(s.farm.flags.billDebt).toBe(0);
    expect(s.farm.flags.powerCut).toBe(false);
    expect(s.farm.flags.unpaidBills).toBe(0);
    await applyAction(s, ctx(), { type: 'power', rigId: 1, on: true });
    expect(r.powered).toBe(true);
    await expect(applyAction(s, ctx(), { type: 'pay_bill' })).rejects.toThrow(/don't owe/);
  });

  it('a bill paid in full on time clears the warning count', () => {
    const s = farm({ day: 7, minute: 22 * 60, coins: 0, powerKwh: 10 });
    sleep(s, ctx(), false);
    expect(s.farm.flags.unpaidBills).toBe(1);
    s.farm.day = 14;
    s.farm.coins = 100_000;
    s.farm.powerKwh = 10;
    sleep(s, ctx(), false);
    expect(s.farm.flags.billDebt).toBe(0);
    expect(s.farm.flags.unpaidBills).toBe(0);
    expect(s.farm.flags.powerCut).toBe(false);
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
