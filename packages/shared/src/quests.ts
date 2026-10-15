/** Quests (MASTERPLAN §11). Rewards are Coins and items only — never NVDA. */
import { rngFor } from './rng.js';
import { NPC_IDS, type NpcId } from './npcs.js';

export type QuestGoal =
  | { type: 'harvest'; count: number }
  | { type: 'clean'; count: number }
  | { type: 'repaste'; count: number }
  | { type: 'talk'; npc: NpcId }
  | { type: 'deliver'; npc: NpcId; itemId: string; qty: number }
  | { type: 'active_rigs'; count: number }
  | { type: 'friendship'; npc: NpcId; level: number }
  | { type: 'own_item'; itemId: string };

export interface QuestReward {
  coins?: number;
  items?: { itemId: string; qty: number }[];
  friendship?: { npc: NpcId; points: number };
}

export type QuestKind = 'main' | 'relationship' | 'daily';

export interface QuestDef {
  id: string;
  kind: QuestKind;
  title: string;
  description: string;
  giver: NpcId | 'ray' | 'board';
  goals: QuestGoal[];
  reward: QuestReward;
}

// ---------------------------------------------------------------------------
// Main story — Uncle Ray letters
// ---------------------------------------------------------------------------
export const MAIN_QUESTS: QuestDef[] = [
  {
    id: 'main_first_harvest',
    kind: 'main',
    title: 'The Garage',
    description: 'Get the old rig running and claim your first harvest.',
    giver: 'ray',
    goals: [{ type: 'harvest', count: 1 }],
    reward: { coins: 100 },
  },
  {
    id: 'main_meet_town',
    kind: 'main',
    title: 'Come to Town',
    description: 'Walk into town and say hi to Mia at the Hardware Store.',
    giver: 'mia',
    goals: [{ type: 'talk', npc: 'mia' }],
    reward: { coins: 50, items: [{ itemId: 'thermal_paste', qty: 2 }] },
  },
  {
    id: 'main_room_to_grow',
    kind: 'main',
    title: 'Room to Grow',
    description: 'Have 3 rigs running at the same time. Then unlock the backyard.',
    giver: 'ray',
    goals: [{ type: 'active_rigs', count: 3 }],
    reward: { coins: 150 },
  },
  {
    id: 'main_cold_river',
    kind: 'main',
    title: 'Cold River',
    description:
      'Have 8 rigs running and become friends with Dex (level 2). Then rent the warehouse.',
    giver: 'ray',
    goals: [
      { type: 'active_rigs', count: 8 },
      { type: 'friendship', npc: 'dex', level: 2 },
    ],
    reward: { coins: 400 },
  },
  {
    id: 'main_cats_on_the_hill',
    kind: 'main',
    title: 'The Cats on the Hill',
    description:
      'Have 15 rigs running and buy a Heated Cat Bed so the cats move out of the data center.',
    giver: 'ray',
    goals: [
      { type: 'active_rigs', count: 15 },
      { type: 'own_item', itemId: 'cat_bed' },
    ],
    reward: { coins: 1000 },
  },
  {
    id: 'main_valley_legend',
    kind: 'main',
    title: 'Valley Legend',
    description: 'Have 25 rigs running at once. Make Uncle Ray proud.',
    giver: 'ray',
    goals: [{ type: 'active_rigs', count: 25 }],
    reward: { coins: 3000, items: [{ itemId: 'decor_trophy', qty: 1 }] },
  },
];

export const MAIN_QUEST_ORDER = MAIN_QUESTS.map((q) => q.id);

// ---------------------------------------------------------------------------
// Relationship quests — offered by mail when friendship reaches `level`
// ---------------------------------------------------------------------------
export const RELATIONSHIP_QUESTS: (QuestDef & { level: number; npc: NpcId })[] = [
  {
    id: 'rel_mia_shelf_help',
    kind: 'relationship',
    npc: 'mia',
    level: 2,
    title: 'Shelf Help',
    description:
      "Mia's paste delivery got lost on the road. Grab 3 tubes of Thermal Paste from Dex's Repair Shop and bring them to her.",
    giver: 'mia',
    goals: [{ type: 'deliver', npc: 'mia', itemId: 'thermal_paste', qty: 3 }],
    reward: {
      coins: 150,
      items: [{ itemId: 'decor_fern', qty: 1 }],
      friendship: { npc: 'mia', points: 40 },
    },
  },
  {
    id: 'rel_bo_secret_recipe',
    kind: 'relationship',
    npc: 'bo',
    level: 2,
    title: 'Secret Recipe',
    description:
      "Bo is inventing a new snack and needs a taste tester. Buy 1 Thermal Hot Sauce and 2 Chip Cookies at the café, then hand them back to Bo — you're on the tasting panel.",
    giver: 'bo',
    goals: [
      { type: 'deliver', npc: 'bo', itemId: 'hot_sauce', qty: 1 },
      { type: 'deliver', npc: 'bo', itemId: 'cookie', qty: 2 },
    ],
    reward: { items: [{ itemId: 'energy_drink', qty: 3 }], friendship: { npc: 'bo', points: 40 } },
  },
  {
    id: 'rel_dex_spare_parts',
    kind: 'relationship',
    npc: 'dex',
    level: 2,
    title: 'Spare Parts',
    description: 'Dex is rebuilding an old rig for the café. Bring him a Pebble CPU.',
    giver: 'dex',
    goals: [{ type: 'deliver', npc: 'dex', itemId: 'cpu_common', qty: 1 }],
    reward: {
      coins: 250,
      items: [{ itemId: 'cooling_lv1', qty: 1 }],
      friendship: { npc: 'dex', points: 40 },
    },
  },
  {
    id: 'rel_vera_north_line',
    kind: 'relationship',
    npc: 'vera',
    level: 3,
    title: 'North Line Down',
    description:
      "A storm knocked out the north line and Vera can't leave the counter. Buy 2 Battery Packs from her shop and bring them to her so she can send them up the line.",
    giver: 'vera',
    goals: [{ type: 'deliver', npc: 'vera', itemId: 'battery_pack', qty: 2 }],
    reward: {
      coins: 300,
      items: [{ itemId: 'surge_shield', qty: 1 }],
      friendship: { npc: 'vera', points: 40 },
    },
  },
  {
    id: 'rel_kai_rivalry',
    kind: 'relationship',
    npc: 'kai',
    level: 2,
    title: 'Friendly Rivalry',
    description: "Kai bets you can't run 5 rigs at once. Prove him wrong.",
    giver: 'kai',
    goals: [{ type: 'active_rigs', count: 5 }],
    reward: {
      coins: 200,
      items: [{ itemId: 'hat_headset', qty: 1 }],
      friendship: { npc: 'kai', points: 40 },
    },
  },
];

// ---------------------------------------------------------------------------
// Daily quests — one arrives in the mailbox every morning, expires at night
// ---------------------------------------------------------------------------
/**
 * Today's job. `variant` re-rolls it deterministically when the first pick can't be
 * done on this farm today (e.g. "clean rigs" when every rig is spotless).
 */
export function dailyQuestFor(farmId: number, day: number, variant = 0): QuestDef {
  const rng = variant
    ? rngFor('daily-quest', farmId, day, variant)
    : rngFor('daily-quest', farmId, day);
  const pick = Math.floor(rng() * 5);
  const npc = NPC_IDS[Math.floor(rng() * NPC_IDS.length)]!;
  const id = variant ? `daily_${day}_${variant}` : `daily_${day}`;
  switch (pick) {
    case 0: {
      // 1-2 rigs: doable from the very first days, when the farm only has a few.
      const n = 1 + Math.floor(rng() * 2);
      return {
        id,
        kind: 'daily',
        giver: 'board',
        title: 'Spring Cleaning',
        description: `Clean the dust off ${n} rig${n > 1 ? 's' : ''} today.`,
        goals: [{ type: 'clean', count: n }],
        reward: { coins: 25 + n * 15 },
      };
    }
    case 1: {
      const n = 1 + Math.floor(rng() * 2);
      return {
        id,
        kind: 'daily',
        giver: 'board',
        title: 'Harvest Time',
        description: `Claim ${n} harvest${n > 1 ? 's' : ''} today.`,
        goals: [{ type: 'harvest', count: n }],
        reward: { coins: 40 * n },
      };
    }
    case 2:
      return {
        id,
        kind: 'daily',
        giver: 'board',
        title: 'Say Hello',
        description: `Have a chat with ${cap(npc)} today.`,
        goals: [{ type: 'talk', npc }],
        reward: { coins: 25, friendship: { npc, points: 10 } },
      };
    case 3: {
      const itemId = (['thermal_paste', 'cookie', 'coffee'] as const)[Math.floor(rng() * 3)]!;
      const names: Record<string, string> = {
        thermal_paste: 'Thermal Paste',
        cookie: 'a Chip Cookie',
        coffee: 'a Coffee',
      };
      return {
        id,
        kind: 'daily',
        giver: 'board',
        title: 'Special Delivery',
        description: `Bring ${names[itemId]} to ${cap(npc)}.`,
        goals: [{ type: 'deliver', npc, itemId, qty: 1 }],
        reward: { coins: 60, friendship: { npc, points: 15 } },
      };
    }
    default:
      return {
        id,
        kind: 'daily',
        giver: 'board',
        title: 'Fresh Paste',
        description: 'Replace the thermal paste on 1 rig today.',
        goals: [{ type: 'repaste', count: 1 }],
        reward: { coins: 45 },
      };
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function findQuest(id: string, farmId: number): QuestDef | undefined {
  const daily = /^daily_(\d+)(?:_(\d+))?$/.exec(id);
  if (daily) return dailyQuestFor(farmId, Number(daily[1]), Number(daily[2] ?? 0));
  return MAIN_QUESTS.find((q) => q.id === id) ?? RELATIONSHIP_QUESTS.find((q) => q.id === id);
}

export function goalText(g: QuestGoal): string {
  switch (g.type) {
    case 'harvest':
      return `Claim ${g.count} harvest${g.count > 1 ? 's' : ''}`;
    case 'clean':
      return `Clean ${g.count} rig${g.count > 1 ? 's' : ''}`;
    case 'repaste':
      return `Repaste ${g.count} rig${g.count > 1 ? 's' : ''}`;
    case 'talk':
      return `Talk to ${cap(g.npc)}`;
    case 'deliver':
      return `Give ${g.qty}× item to ${cap(g.npc)}`;
    case 'active_rigs':
      return `Have ${g.count} rigs running`;
    case 'friendship':
      return `Reach friendship level ${g.level} with ${cap(g.npc)}`;
    case 'own_item':
      return 'Own the item';
  }
}
