/**
 * The guide: what the player should do next, and where. Drives the objective panel,
 * the bouncing arrow, the ground beacon and the off-screen pointer.
 */
import {
  ENERGY_COST,
  REAL_MS_PER_GAME_MINUTE,
  canSleep,
  earliestBedtime,
  formatDuration,
  SCRAPS_PER_DAY,
  SCRAP_SET_BONUS,
  SCRAP_SPOTS,
  TOWNFOLK_HOURS,
  NPCS,
  formatClock,
  type NpcId,
  FIELDS,
  FRESH_PASTE,
  MINIGAMES,
  SHOPS,
  STAGES,
  TILE,
  TUTORIAL_SLOT,
  allSlots,
  calendar,
  findQuest,
  formatInt,
  friendshipLevel,
  getItem,
  isRigActive,
  isFood,
  isShopOpen,
  shopHoursText,
  stageDef,
  type StateDTO,
} from '@rig-valley/shared';

export interface WorldPoints {
  /** Interaction zones by action, in world pixels (center). */
  zones: Map<string, { x: number; y: number }>;
  /** NPC home spots in world pixels. */
  npcs: Map<string, { x: number; y: number }>;
}

export interface Objective {
  id: string;
  /** Short line, e.g. "Open Uncle Ray's box". */
  title: string;
  /** How to do it, written for someone who never played a farming game. */
  detail: string;
  /** Where to go (world pixels), or null when it can be done anywhere. */
  target: { x: number; y: number } | null;
  /** The bigger goal this step serves, e.g. "Saving for the Yard: 190 / 600 Coins". */
  goal?: string;
  /** Tutorial progress, when in the tutorial. */
  step?: { index: number; total: number };
  /** Rig id the tutorial wants highlighted in menus. */
  rigId?: number;
}

const TUTORIAL_TOTAL = 7;

function tile(x: number, y: number, dy = 8) {
  return { x: x * TILE + 8, y: y * TILE + dy };
}

export function currentObjective(
  s: StateDTO,
  pts: WorldPoints,
  minute: number,
  /** Player position (world pixels), to point at the nearest of several targets. */
  from?: { x: number; y: number },
): Objective | null {
  const f = s.farm;
  const step = f.tutorialStep;
  const tutRig = s.rigs.find((r) => r.x === TUTORIAL_SLOT.x && r.y === TUTORIAL_SLOT.y);
  const rigPt = tile(TUTORIAL_SLOT.x, TUTORIAL_SLOT.y, 4);
  const z = (a: string) => pts.zones.get(a) ?? null;
  const tut = (index: number) => ({ index: index + 1, total: TUTORIAL_TOTAL });

  // ------------------------------------------------------------------ tutorial
  switch (step) {
    case 0:
      return {
        id: 'tut_letter',
        title: "Read Uncle Ray's letter",
        detail: 'Walk to the mailbox next to the garage and press E. You can also press M anytime.',
        target: z('mailbox'),
        step: tut(0),
      };
    case 1:
      return {
        id: 'tut_box',
        title: "Open Uncle Ray's box",
        detail: 'The cardboard box is right in front of the garage. Walk up to it and press E.',
        target: z('box'),
        step: tut(1),
      };
    case 2:
      return {
        id: 'tut_install',
        title: 'Put the CPU in the rig',
        detail:
          'Walk to the rig in the field next to the garage and press E. Click "Install…" on the CPU row, then pick the Pebble CPU.',
        target: rigPt,
        step: tut(2),
        rigId: tutRig?.id,
      };
    case 3:
      return {
        id: 'tut_power',
        title: 'Switch the rig on',
        detail:
          'Open the rig again (E) and click "Switch on". Its light turns yellow while it boots.',
        target: rigPt,
        step: tut(3),
        rigId: tutRig?.id,
      };
    case 4:
      return {
        id: 'tut_clean',
        title: 'Wipe the dust off',
        detail:
          'Dusty rigs run hot. Open the rig (E) and click "Clean" — it uses your cloth and 2 Energy.',
        target: rigPt,
        step: tut(4),
        rigId: tutRig?.id,
      };
    case 5:
      return {
        id: 'tut_sleep',
        title: 'Go to bed',
        detail:
          'Rigs work overnight. Walk to the big garage door and press E to sleep until morning.',
        target: z('sleep'),
        step: tut(5),
      };
    case 6:
      return {
        id: 'tut_claim',
        title: 'Claim your first harvest',
        detail:
          'A gold coin floats over your rig. Walk to it and press E to collect Coins and NVDA.',
        target: rigPt,
        step: tut(6),
        rigId: tutRig?.id,
      };
  }

  // ------------------------------------------------------------------ late night
  if (minute >= 24 * 60 + 60)
    return {
      id: 'late',
      title: "It's very late — go to bed",
      detail: 'At 2:00 AM you pass out and pay a fee. Sleep at the garage door (E).',
      target: z('sleep'),
    };

  const canSleepNow = canSleep(f.day, minute, f.energy);
  const bedtime = earliestBedtime(f.day, f.energy);
  const active = (id: string) => s.quests.find((q) => q.questId === id && q.state === 'active');
  const done = (id: string) => s.quests.some((q) => q.questId === id && q.state === 'done');
  const cal = calendar(f.day);
  const shopTarget = (shopId: keyof typeof SHOPS, npc: string, why: string): Objective => {
    const shop = SHOPS[shopId];
    const open = isShopOpen(shop, minute, cal.weekdayIndex);
    return {
      id: `shop_${shopId}`,
      title: why,
      detail: open
        ? `Walk into town (follow the road north) and press E at the ${shop.name}.`
        : shop.closedOn !== cal.weekdayIndex && minute < shop.open
          ? `The ${shop.name} opens at ${shopHoursText(shop).split(' – ')[0]}. Look after your rigs until then, or head over and wait.`
          : `The ${shop.name} is closed right now (${shopHoursText(shop)}). Come back when it opens${canSleepNow ? ' — or sleep until morning' : ''}.`,
      target: open ? (pts.npcs.get(npc) ?? z(`shop:${shopId}`)) : z(`shop:${shopId}`),
    };
  };
  const qty = (id: string) => s.inventory.find((i) => i.itemId === id)?.qty ?? 0;
  const running = s.rigs.filter(isRigActive).length;

  /** Too tired for the next step: point at the quickest way to get Energy back. */
  const rest = (need: number, what: string, title: string): Objective => {
    const head = `You need ${need} Energy to ${what} and have ${f.energy}.`;
    const food = s.inventory.find((i) => isFood(getItem(i.itemId)));
    if (food)
      return {
        id: 'rest_eat',
        title,
        detail: `${head} Eat the ${getItem(food.itemId)!.name} in your hotbar (click it).`,
        target: null,
      };
    if (f.coins >= 15 && isShopOpen(SHOPS.cafe, minute, cal.weekdayIndex))
      return {
        id: 'rest_cafe',
        title,
        detail: `${head} Grab a Coffee (+20 Energy) at Bo's café, or sleep for a full refill.`,
        target: pts.npcs.get('bo') ?? z('shop:cafe'),
      };
    if (!canSleepNow)
      return {
        id: 'rest_wait',
        title,
        detail: `${head} You can go to bed from ${formatClock(bedtime)}. Until then, shiny scraps and chats with folks in town cost no Energy.`,
        target: nearestScrap(),
      };
    return {
      id: 'rest_sleep',
      title,
      detail: `${head} Sleep at the garage door (E) to wake up with full Energy.`,
      target: z('sleep'),
    };
  };

  /** Steps to get another rig running: buy → build → install → switch on. */
  const growRigs = (want: number, title: string): Objective => {
    const max = stageDef(f.stage).maxRigs;
    const noCpu = s.rigs.find((r) => !r.cpuId);
    const off = s.rigs.find((r) => r.cpuId && !r.powered && r.condition > 0 && !r.overheat);
    const frames = s.inventory
      .filter((i) => i.itemId.startsWith('frame_'))
      .reduce((t, i) => t + i.qty, 0);
    const cpus = s.inventory
      .filter((i) => i.itemId.startsWith('cpu_'))
      .reduce((t, i) => t + i.qty, 0);
    if (off)
      return {
        id: 'grow_on',
        title,
        detail: `Switch on your rig (E → "Switch on"). Running: ${running}/${want}.`,
        target: tile(off.x, off.y, 4),
        rigId: off.id,
      };
    if (noCpu && cpus > 0 && f.energy < ENERGY_COST.install)
      return rest(ENERGY_COST.install, 'install a CPU', title);
    if (noCpu && cpus > 0)
      return {
        id: 'grow_cpu',
        title,
        detail: `Install a CPU in your empty rig (E → "Install…"). Running: ${running}/${want}.`,
        target: tile(noCpu.x, noCpu.y, 4),
        rigId: noCpu.id,
      };
    if (frames > 0 && s.rigs.length < max) {
      const slot = emptySlot(s);
      if (slot && f.energy < ENERGY_COST.build)
        return rest(ENERGY_COST.build, 'build a rig', title);
      if (slot)
        return {
          id: 'grow_build',
          title,
          detail: `Stand on a glowing empty slot and press E → "Build a rig". Running: ${running}/${want}.`,
          target: slot,
        };
    }
    if (s.rigs.length >= max)
      return {
        id: 'grow_full',
        title,
        detail: `You have the most rigs this place allows (${max}). Unlock more space to grow.`,
        target: null,
      };
    const need =
      (frames > 0 ? 0 : (getItem('frame_t1')?.price ?? 0)) +
      (cpus > 0 ? 0 : (getItem('cpu_common')?.price ?? 0));
    if (f.coins < need)
      return earn(
        `${title} (${running}/${want} running). Next rig: ${formatInt(need)} Coins — you have ${formatInt(f.coins)}.`,
        false,
      );
    const o = shopTarget('hardware', 'mia', title);
    return {
      ...o,
      detail: `You need a rig frame (Scrap Frame) and a CPU (Pebble CPU) for each new rig — Mia sells both. ${o.detail} Running: ${running}/${want}.`,
    };
  };

  /**
   * Saving up: never just "wait". Points at the best thing to do right now for Coins,
   * and says what it is for (`why` becomes the objective's goal line).
   */
  const earn = (why: string, allowGrow: boolean): Objective => ({
    ...earnStep(why, allowGrow),
    goal: why,
  });
  const earnStep = (why: string, allowGrow: boolean): Objective => {
    const ready = s.rigs.find((r) => r.status === 'ready');
    if (ready)
      return {
        id: 'earn_claim',
        title: 'Claim your harvest',
        detail: `A rig with a gold coin is ready. Walk to it and press E.`,
        target: tile(ready.x, ready.y, 4),
        rigId: ready.id,
      };
    const hot = s.rigs.find((r) => r.status === 'overheat' || r.status === 'broken');
    if (hot)
      return {
        id: 'earn_service',
        title: 'Fix your stopped rig',
        detail: `A stopped rig earns nothing. Open it (E) to clean, repaste or repair it, then switch it on.`,
        target: tile(hot.x, hot.y, 4),
        rigId: hot.id,
      };
    if (allowGrow && s.rigs.length < stageDef(f.stage).maxRigs) {
      const g = growRigs(s.rigs.length + 1, 'Add another rig');
      if (!g.id.startsWith('earn_') && g.id !== 'grow_full')
        return { ...g, detail: `More rigs = more Coins every harvest. ${g.detail}` };
    }
    const daily = dailyJob();
    if (daily) return daily;
    if (!f.daily.minigamePlayed && f.energy >= MINIGAMES.coffee_rush.energy) {
      const o = shopTarget('cafe', 'bo', 'Help Bo at the café');
      return {
        ...o,
        id: 'earn_coffee',
        detail: isShopOpen(SHOPS.cafe, minute, cal.weekdayIndex)
          ? `Talk to Bo at the café (E) and pick "Help out: Coffee Rush" — once a day, for Coins.`
          : `Coffee Rush pays Coins once a day. ${o.detail}`,
      };
    }
    const scrap = nearestScrap();
    if (scrap)
      return {
        id: 'earn_scrap',
        title: `Search for shiny scraps (${s.farm.daily.scraps.length} left today)`,
        detail: `Little glints are hidden around the valley. Walk over and press E — Coins, snacks, sometimes something rare. Find all ${SCRAPS_PER_DAY} today for a ${SCRAP_SET_BONUS} Coin bonus.`,
        target: scrap,
      };
    const friend = makeFriends();
    if (friend) return friend;
    const tip = allowGrow ? '' : ' Tip: more rigs earn more Coins (Mia sells parts).';
    if (!canSleepNow)
      return {
        id: 'earn_wait_bed',
        title: 'Let your rigs work',
        detail: `You've done everything for now — your rigs keep earning while you play. Bedtime is from ${formatClock(bedtime)} (about ${formatDuration((bedtime - minute) * REAL_MS_PER_GAME_MINUTE)} of play). Meanwhile, check the Market Board or tidy up your rigs.${tip}`,
        target: z('sleep'),
      };
    return {
      id: 'earn_sleep',
      title: 'Let your rigs work',
      detail: `You've done everything for today. Rigs keep earning overnight — sleep at the garage door (E) to skip ahead.${tip}`,
      target: z('sleep'),
    };
  };

  /**
   * Nothing to earn right now: chatting builds friendships (discounts, tips, gifts).
   * Points at someone in town, or says when the shops open.
   */
  function makeFriends(): Objective | null {
    // Town folk first; Vera's substation is a long walk east.
    const order: NpcId[] = ['mia', 'bo', 'dex', 'kai', 'vera'];
    const waiting = order.filter((n) => !s.relations.find((r) => r.npc === n)?.talkedToday);
    const shopOf = (n: NpcId) => NPCS[n].shop;
    const here = (n: NpcId) => {
      const shop = shopOf(n);
      return shop
        ? isShopOpen(SHOPS[shop], minute, cal.weekdayIndex)
        : minute >= TOWNFOLK_HOURS.open && minute < TOWNFOLK_HOURS.close;
    };
    const opensSoon = (n: NpcId) => {
      const shop = shopOf(n);
      const open = shop ? SHOPS[shop].open : TOWNFOLK_HOURS.open;
      const closedToday = shop ? SHOPS[shop].closedOn === cal.weekdayIndex : false;
      return !closedToday && minute < open && open - minute <= 60;
    };
    const townSoon = waiting.some((n) => n !== 'vera' && opensSoon(n));
    const now = waiting.find((n) => here(n) && !(n === 'vera' && townSoon));
    if (now)
      return {
        id: 'earn_friends',
        title: `Say hi to ${NPCS[now].name}`,
        detail: `Chat with people every day (E → talk). Friends give discounts, tips and gifts.`,
        target: pts.npcs.get(now) ?? null,
      };
    const later = waiting
      .map((n) => {
        const shop = shopOf(n);
        const open = shop ? SHOPS[shop].open : TOWNFOLK_HOURS.open;
        const closedToday = shop ? SHOPS[shop].closedOn === cal.weekdayIndex : false;
        return { n, open, ok: !closedToday && minute < open };
      })
      .filter((x) => x.ok)
      .sort((a, b) => a.open - b.open)[0];
    if (!later) return null;
    return {
      id: 'earn_wait',
      title: 'Town wakes up soon',
      detail: `${NPCS[later.n].name} is around from ${formatClock(later.open)} — come say hi to make friends. Your rigs keep working meanwhile.`,
      target: pts.npcs.get(later.n) ?? null,
    };
  }

  /** The closest glint still sparkling today. */
  function nearestScrap(): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const i of s.farm.daily.scraps) {
      const p = SCRAP_SPOTS[i];
      if (!p) continue;
      const t = tile(p.x, p.y, 10);
      const d = from ? Math.hypot(t.x - from.x, t.y - from.y) : i;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Today's job from the mailbox, but only when it can be done right now. */
  function dailyJob(): Objective | null {
    const dq = s.quests.find((q) => q.kind === 'daily' && q.state === 'active');
    const goal = dq && findQuest(dq.questId, f.id)?.goals[0];
    if (!dq || !goal) return null;
    const job = (target: { x: number; y: number } | null, extra = ''): Objective => ({
      id: 'earn_daily',
      title: `Today's job: ${dq.title}`,
      detail: `${dq.description}${extra} It pays Coins (see your Journal, J).`,
      target,
    });
    const rigAt = (r: { x: number; y: number }) => tile(r.x, r.y, 4);
    switch (goal.type) {
      case 'talk':
        return job(pts.npcs.get(goal.npc) ?? null);
      case 'deliver': {
        if (qty(goal.itemId) >= goal.qty) return job(pts.npcs.get(goal.npc) ?? null);
        const shopId = goal.itemId === 'thermal_paste' ? 'hardware' : 'cafe';
        const o = shopTarget(shopId, shopId === 'cafe' ? 'bo' : 'mia', '');
        const name = getItem(goal.itemId)?.name ?? 'it';
        const shop = SHOPS[shopId];
        // Shop still closed: do something else first; the job comes back once it opens.
        if (!isShopOpen(shop, minute, cal.weekdayIndex)) return null;
        return job(o.target, ` First buy ${name} at the ${shop.name}.`);
      }
      case 'clean': {
        const r = s.rigs.find((x) => x.dust > 0 || x.overheat);
        return r && qty('cloth') > 0 ? job(rigAt(r)) : null;
      }
      case 'repaste': {
        const r = s.rigs.find((x) => x.cpuId && (x.paste < FRESH_PASTE || x.overheat));
        return r && qty('thermal_paste') > 0 ? job(rigAt(r)) : null;
      }
      default:
        // Harvests: claiming a ready rig is already the first suggestion.
        return null;
    }
  }

  // ------------------------------------------------------------------ power bill
  /** Vera's substation: pay off what's owed (part payments are fine). */
  const payBill = (title: string, why: string): Objective => {
    const shop = SHOPS.substation;
    const open = isShopOpen(shop, minute, cal.weekdayIndex);
    return {
      id: 'pay_bill',
      title,
      detail: open
        ? `${why} Walk to Vera's Power Substation and press E → "Pay bill". You have ${formatInt(f.coins)} Coins.`
        : `${why} Vera's Power Substation is closed right now (${shopHoursText(shop)}) — come back when it opens.`,
      target: open ? (pts.npcs.get('vera') ?? z('shop:substation')) : z('shop:substation'),
    };
  };
  if (f.powerCut) {
    const why = `Vera cut your power: pay the ${formatInt(f.billDebt)} Coins you owe to switch your rigs back on.`;
    if (f.coins > 0) return payBill('Pay your power bill', why);
    return earn(why, false);
  }
  if (
    f.billDebt > 0 &&
    f.coins >= f.billDebt &&
    isShopOpen(SHOPS.substation, minute, cal.weekdayIndex)
  )
    return payBill(
      'Pay off your power bill',
      `You owe Vera ${formatInt(f.billDebt)} Coins. Two short bills in a row and she cuts your power.`,
    );

  // ------------------------------------------------------------------ story
  if (active('main_meet_town')) return shopTarget('hardware', 'mia', 'Meet Mia in town');

  if (active('main_room_to_grow')) return growRigs(3, 'Get 3 rigs running at once');
  const gate = (st: 2 | 3 | 4): Objective | null => {
    if (f.stage >= st) return null;
    const def = STAGES[st - 1]!;
    if (def.quest && !done(def.quest)) return null;
    if (f.coins < def.cost)
      return earn(
        `Saving for the ${def.name}: ${formatInt(f.coins)} / ${formatInt(def.cost)} Coins.`,
        false,
      );
    return {
      id: `gate_${st}`,
      title: `Unlock the ${def.name}`,
      detail: `Read the sign (E) and pay ${formatInt(def.cost)} Coins to unlock it. You have ${formatInt(f.coins)}.`,
      target: z(`gate:${st}`),
    };
  };
  const g2 = gate(2);
  if (g2) return g2;
  if (active('main_cold_river')) {
    if (running < 8) return growRigs(8, 'Get 8 rigs running at once');
    const dex = friendshipLevel(s.relations.find((r) => r.npc === 'dex')?.points ?? 0);
    if (dex < 2) {
      const o = shopTarget('repair', 'dex', 'Make friends with Dex (level 2)');
      return {
        ...o,
        detail: `Chat with Dex every day and bring him gifts he likes (a Solder Kit is perfect). ${o.detail}`,
      };
    }
  }
  const g3 = gate(3);
  if (g3) return g3;
  if (active('main_cats_on_the_hill')) {
    if (qty('cat_bed') < 1) {
      const o = shopTarget('hardware', 'mia', 'Buy a Heated Cat Bed');
      return {
        ...o,
        detail: `The cats will only leave the data center for something warmer. ${o.detail}`,
      };
    }
    if (running < 15) return growRigs(15, 'Get 15 rigs running at once');
  }
  const g4 = gate(4);
  if (g4) return g4;
  if (active('main_valley_legend')) return growRigs(25, 'Become a Valley Legend: 25 rigs');

  // ------------------------------------------------------------------ free play
  const ready = s.rigs.find((r) => r.status === 'ready');
  if (ready)
    return {
      id: 'claim',
      title: 'A rig is ready to claim',
      detail: 'Walk to the rig with the gold coin and press E.',
      target: tile(ready.x, ready.y, 4),
    };
  const hot = s.rigs.find((r) => r.status === 'overheat' || r.status === 'broken');
  if (hot)
    return {
      id: 'service',
      title: 'A rig needs help',
      detail: 'Clean, repaste or repair it from the rig menu (E).',
      target: tile(hot.x, hot.y, 4),
      rigId: hot.id,
    };
  return null;
}

function emptySlot(s: StateDTO): { x: number; y: number } | null {
  const used = new Set([
    ...s.rigs.map((r) => `${r.x},${r.y}`),
    ...s.coolingUnits.map((c) => `${c.x},${c.y}`),
    ...s.decor.map((d) => `${d.x},${d.y}`),
  ]);
  for (const f of FIELDS) {
    if (f.stage > s.farm.stage) continue;
    for (const sl of allSlots(f)) if (!used.has(`${sl.x},${sl.y}`)) return tile(sl.x, sl.y);
  }
  return null;
}
