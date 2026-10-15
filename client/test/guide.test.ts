import { describe, expect, it } from 'vitest';
import { newRig, type RigDTO, type StateDTO } from '@rig-valley/shared';
import { currentObjective, type WorldPoints } from '../src/game/guide';

const points: WorldPoints = {
  zones: new Map([
    ['mailbox', { x: 200, y: 472 }],
    ['box', { x: 168, y: 488 }],
    ['sleep', { x: 120, y: 472 }],
    ['shop:hardware', { x: 232, y: 152 }],
    ['shop:repair', { x: 552, y: 152 }],
    ['gate:2', { x: 248, y: 632 }],
    ['shop:cafe', { x: 392, y: 152 }],
  ]),
  npcs: new Map([
    ['bo', { x: 400, y: 166 }],
    ['mia', { x: 260, y: 166 }],
    ['dex', { x: 580, y: 166 }],
  ]),
};

function rigDto(over: Partial<RigDTO> = {}): RigDTO {
  const r = newRig(1, 17, 31, 'frame_t1');
  return {
    ...r,
    status: 'frame',
    watts: 0,
    speed: 0,
    temps: {
      total: 28,
      ambient: 28,
      cpu: 0,
      cooler: 0,
      frame: 0,
      field: 0,
      coolingUnits: 0,
      neighbors: 0,
      dust: 0,
      paste: 0,
    },
    ...over,
  } as RigDTO;
}

function state(
  over: {
    step?: number;
    quests?: StateDTO['quests'];
    rigs?: RigDTO[];
    inventory?: StateDTO['inventory'];
    stage?: number;
    coins?: number;
    minigamePlayed?: boolean;
    scraps?: number[];
    energy?: number;
    billDebt?: number;
    powerCut?: boolean;
    /** Already chatted with everyone today. */
    talkedAll?: boolean;
  } = {},
): StateDTO {
  return {
    serverTime: 0,
    farm: {
      id: 1,
      address: '0x0',
      farmName: 'T',
      character: { name: 'T', hair: 'ink', hat: 'none' },
      stage: over.stage ?? 1,
      energy: over.energy ?? 100,
      maxEnergy: 100,
      coins: over.coins ?? 300,
      day: 3,
      minute: 600,
      paused: false,
      weather: 'sunny',
      weatherTomorrow: 'sunny',
      powerCapacity: 500,
      powerDraw: 0,
      powerUpgrades: [],
      powerKwh: 0,
      tutorialStep: over.step ?? 7,
      harvestCount: 1,
      boxOpened: true,
      billDebt: over.billDebt ?? 0,
      powerCut: over.powerCut ?? false,
      daily: {
        coffeeRush: null,
        scraps: over.scraps ?? [],
        minigamePlayed: over.minigamePlayed ?? false,
        festivalJoined: false,
        freeCoffee: false,
        raceDone: false,
      },
      ownedHats: ['none'],
    },
    rigs: over.rigs ?? [rigDto()],
    coolingUnits: [],
    decor: [],
    inventory: over.inventory ?? [],
    relations: over.talkedAll
      ? (['mia', 'bo', 'dex', 'kai', 'vera'] as const).map((npc) => ({
          npc,
          points: 0,
          level: 0,
          talkedToday: true,
          giftedToday: false,
        }))
      : [],
    quests: over.quests ?? [],
    mail: [],
    rewards: {} as StateDTO['rewards'],
    festival: null,
    rareRestock: false,
  };
}

const q = (questId: string, st: 'active' | 'done' = 'active') => ({
  questId,
  kind: 'main' as const,
  title: '',
  description: '',
  state: st,
  progress: [],
});

describe('guide', () => {
  it('walks through every tutorial step with a target', () => {
    const ids = [0, 1, 2, 3, 4, 5, 6].map((step) => currentObjective(state({ step }), points, 600));
    expect(ids.map((o) => o?.id)).toEqual([
      'tut_letter',
      'tut_box',
      'tut_install',
      'tut_power',
      'tut_clean',
      'tut_sleep',
      'tut_claim',
    ]);
    for (const o of ids) expect(o?.target).not.toBeNull();
    expect(ids[1]!.target).toEqual(points.zones.get('box'));
    expect(ids[1]!.step).toEqual({ index: 2, total: 7 });
  });

  it('sends the player to Mia, or to the closed shop door with opening hours', () => {
    const open = currentObjective(state({ quests: [q('main_meet_town')] }), points, 10 * 60)!;
    expect(open.title).toBe('Meet Mia in town');
    expect(open.target).toEqual(points.npcs.get('mia'));
    const closed = currentObjective(state({ quests: [q('main_meet_town')] }), points, 7 * 60)!;
    expect(closed.target).toEqual(points.zones.get('shop:hardware'));
    expect(closed.detail).toMatch(/opens at 8 AM/);
    const evening = currentObjective(state({ quests: [q('main_meet_town')] }), points, 19 * 60)!;
    expect(evening.target).toEqual(points.zones.get('shop:hardware'));
    expect(evening.detail).toMatch(/closed right now/);
  });

  it('guides the rig-building loop: buy → build → install → switch on', () => {
    const base = { quests: [q('main_room_to_grow')] };
    expect(currentObjective(state({ ...base }), points, 600)!.detail).toMatch(/Scrap Frame/);
    const build = currentObjective(
      state({
        ...base,
        inventory: [{ itemId: 'frame_t1', qty: 1 }],
        rigs: [rigDto({ cpuId: 'cpu_common', powered: true, status: 'mining' })],
      }),
      points,
      600,
    )!;
    expect(build.id).toBe('grow_build');
    const install = currentObjective(
      state({ ...base, inventory: [{ itemId: 'cpu_common', qty: 1 }] }),
      points,
      600,
    )!;
    expect(install.id).toBe('grow_cpu');
    const on = currentObjective(
      state({ ...base, rigs: [rigDto({ cpuId: 'cpu_common', status: 'installed' })] }),
      points,
      600,
    )!;
    expect(on.id).toBe('grow_on');
  });

  it('points at the gate once the story quest is done and the Coins are there', () => {
    const o = currentObjective(
      state({ quests: [q('main_room_to_grow', 'done')], coins: 700 }),
      points,
      600,
    )!;
    expect(o.id).toBe('gate_2');
    expect(o.target).toEqual(points.zones.get('gate:2'));
  });

  it('gives a concrete way to earn while saving for the gate', () => {
    const done = [q('main_room_to_grow', 'done')];
    const working = rigDto({ cpuId: 'cpu_common', powered: true, status: 'mining' });
    // A ready rig comes first.
    const claim = currentObjective(
      state({ quests: done, coins: 100, rigs: [rigDto({ cpuId: 'cpu_common', status: 'ready' })] }),
      points,
      600,
    )!;
    expect(claim.id).toBe('earn_claim');
    expect(claim.goal).toMatch(/100 \/ 600 Coins/);
    // Too poor for another rig: help Bo at the café.
    const coffee = currentObjective(
      state({ quests: done, coins: 100, rigs: [working] }),
      points,
      600,
    )!;
    expect(coffee.id).toBe('earn_coffee');
    expect(coffee.target).toEqual(points.npcs.get('bo'));
    // Coffee done and glints around: point at the nearest one.
    const near = currentObjective(
      state({ quests: done, coins: 100, rigs: [working], minigamePlayed: true, scraps: [0, 25] }),
      points,
      600,
      { x: 18 * 16, y: 29 * 16 },
    )!;
    expect(near.id).toBe('earn_scrap');
    expect(near.target).toEqual({ x: 18 * 16 + 8, y: 28 * 16 + 10 });
    // Coffee done: make friends with whoever is in town.
    const chat = currentObjective(
      state({ quests: done, coins: 100, rigs: [working], minigamePlayed: true }),
      points,
      600,
    )!;
    expect(chat.id).toBe('earn_friends');
    expect(chat.target).toEqual(points.npcs.get('mia'));
    // Late evening, everyone home: sleep.
    const sleep = currentObjective(
      state({ quests: done, coins: 100, rigs: [working], minigamePlayed: true }),
      points,
      22 * 60 + 30,
    )!;
    expect(sleep.id).toBe('earn_sleep');
    expect(sleep.target).toEqual(points.zones.get('sleep'));
    // Saving stays the goal even when a rig is affordable (no spending the gate money).
    const saving = currentObjective(
      state({ quests: done, coins: 400, rigs: [working] }),
      points,
      600,
    )!;
    expect(saving.id).toBe('earn_coffee');
  });

  it('warns about bedtime late at night', () => {
    expect(currentObjective(state(), points, 25 * 60 + 10)!.id).toBe('late');
  });

  it('only suggests bed once it is bedtime', () => {
    const done = [q('main_room_to_grow', 'done')];
    const working = rigDto({ cpuId: 'cpu_common', powered: true, status: 'mining' });
    const idle = {
      quests: done,
      coins: 100,
      rigs: [working],
      minigamePlayed: true,
      talkedAll: true,
    };
    // Everything done at 7 PM: rigs work, bed opens at 8 PM.
    const wait = currentObjective(state(idle), points, 19 * 60)!;
    expect(wait.id).toBe('earn_wait_bed');
    expect(wait.detail).toMatch(/8:00 PM/);
    expect(currentObjective(state(idle), points, 20 * 60)!.id).toBe('earn_sleep');
    // Worn out (30 Energy or less): bed from 2 PM.
    expect(currentObjective(state({ ...idle, energy: 20 }), points, 14 * 60)!.id).toBe(
      'earn_sleep',
    );
    expect(currentObjective(state({ ...idle, energy: 20 }), points, 13 * 60)!.id).toBe(
      'earn_wait_bed',
    );
    // Too tired to build at 10 AM, café out of reach: no "go to bed", but free things to do.
    const tired = currentObjective(
      state({
        quests: [q('main_room_to_grow')],
        coins: 0,
        energy: 4,
        rigs: [rigDto()],
        inventory: [{ itemId: 'cpu_common', qty: 1 }],
      }),
      points,
      10 * 60,
    )!;
    expect(tired.id).toBe('rest_wait');
    expect(tired.detail).toMatch(/2:00 PM/);
  });

  it('sends the player to Vera when the power is cut or a bill is owed', () => {
    const cut = currentObjective(
      state({ coins: 50, billDebt: 120, powerCut: true }),
      points,
      10 * 60,
    )!;
    expect(cut.id).toBe('pay_bill');
    expect(cut.detail).toMatch(/120 Coins/);
    // Broke and cut off: earn Coins first (the reason stays visible).
    const broke = currentObjective(
      state({ coins: 0, billDebt: 120, powerCut: true }),
      points,
      10 * 60,
    )!;
    expect(broke.goal).toMatch(/cut your power/);
    // Owing but not cut: a reminder when it's affordable and Vera is open.
    expect(currentObjective(state({ coins: 500, billDebt: 120 }), points, 10 * 60)!.id).toBe(
      'pay_bill',
    );
    expect(currentObjective(state({ coins: 50, billDebt: 120 }), points, 10 * 60)?.id).not.toBe(
      'pay_bill',
    );
  });
});
