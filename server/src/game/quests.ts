/** Quest tracking: counters, stateful goals, completion and the main story chain. */
import {
  MAIN_QUESTS,
  NPCS,
  RELATIONSHIP_QUESTS,
  FRESH_PASTE,
  dailyQuestFor,
  findQuest,
  friendshipLevel,
  getItem,
  goalText,
  isRigActive,
  type NpcId,
  type QuestDef,
  type QuestGoal,
  type QuestStateDTO,
  type QuestReward,
} from '@rig-valley/shared';
import { addCoins, addFriendship, addItem, itemQty, sendMail, type EngineCtx } from './helpers.js';
import type { FarmState, QuestRow } from './state.js';

export type QuestSignal =
  { type: 'harvest' } | { type: 'clean' } | { type: 'repaste' } | { type: 'talk'; npc: NpcId };

export function activeRigCount(s: FarmState): number {
  return s.rigs.filter(isRigActive).length;
}

export function addQuest(s: FarmState, questId: string): void {
  if (s.quests.some((q) => q.questId === questId)) return;
  const def = findQuest(questId, s.farm.id);
  if (!def) return;
  s.quests.push({
    questId,
    state: 'active',
    progress: def.goals.map(() => 0),
    createdDay: s.farm.day,
  });
}

export function questDone(s: FarmState, questId: string): boolean {
  return s.quests.some((q) => q.questId === questId && q.state === 'done');
}

/** Counter goals advanced by player actions. */
export function signalQuests(s: FarmState, ctx: EngineCtx, signal: QuestSignal): void {
  for (const q of s.quests) {
    if (q.state !== 'active') continue;
    const def = findQuest(q.questId, s.farm.id);
    if (!def) continue;
    def.goals.forEach((g, i) => {
      if (g.type === signal.type) {
        if (g.type === 'talk' && signal.type === 'talk' && g.npc !== signal.npc) return;
        q.progress[i] = (q.progress[i] ?? 0) + 1;
      }
    });
  }
  refreshQuests(s, ctx);
}

function goalProgress(
  s: FarmState,
  q: QuestRow,
  g: QuestGoal,
  i: number,
): { current: number; target: number } {
  switch (g.type) {
    case 'harvest':
    case 'clean':
    case 'repaste':
      return { current: Math.min(q.progress[i] ?? 0, g.count), target: g.count };
    case 'talk':
      return { current: Math.min(q.progress[i] ?? 0, 1), target: 1 };
    case 'deliver':
      return { current: Math.min(q.progress[i] ?? 0, g.qty), target: g.qty };
    case 'active_rigs':
      return {
        current: Math.min(Math.max(activeRigCount(s), q.progress[i] ?? 0), g.count),
        target: g.count,
      };
    case 'friendship':
      return {
        current: Math.min(friendshipLevel(s.relations.get(g.npc) ?? 0), g.level),
        target: g.level,
      };
    case 'own_item':
      return { current: itemQty(s, g.itemId) > 0 || s.farm.stage >= 4 ? 1 : 0, target: 1 };
  }
}

export function rewardText(r: QuestReward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins.toLocaleString('en-US')} Coins`);
  for (const it of r.items ?? [])
    parts.push(`${it.qty > 1 ? `${it.qty}× ` : ''}${getItem(it.itemId)?.name ?? it.itemId}`);
  if (r.friendship) parts.push(`${NPCS[r.friendship.npc].name}'s friendship`);
  return parts.join(', ') || 'Thanks!';
}

function grantReward(s: FarmState, ctx: EngineCtx, def: QuestDef): void {
  const r = def.reward;
  if (r.coins) addCoins(s, r.coins, `quest:${def.id}`);
  for (const it of r.items ?? []) addItem(s, it.itemId, it.qty);
  if (r.friendship) addFriendship(s, ctx, r.friendship.npc, r.friendship.points);
}

/** Re-evaluate all active quests; complete any that are done. */
export function refreshQuests(s: FarmState, ctx: EngineCtx): void {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 10) {
    changed = false;
    for (const q of s.quests) {
      if (q.state !== 'active') continue;
      const def = findQuest(q.questId, s.farm.id);
      if (!def) continue;
      // Remember the best active-rig count reached (goals are "at the same time").
      def.goals.forEach((g, i) => {
        if (g.type === 'active_rigs')
          q.progress[i] = Math.max(q.progress[i] ?? 0, activeRigCount(s));
      });
      const complete = def.goals.every((g, i) => {
        const p = goalProgress(s, q, g, i);
        return p.current >= p.target;
      });
      if (!complete) continue;
      q.state = 'done';
      grantReward(s, ctx, def);
      ctx.events.push({
        kind: 'quest_done',
        questId: def.id,
        title: def.title,
        reward: rewardText(def.reward),
      });
      onQuestComplete(s, def);
      changed = true;
    }
  }
  offerRelationshipQuests(s);
}

/** Main story chain (MASTERPLAN §8, §11). */
function onQuestComplete(s: FarmState, def: QuestDef): void {
  switch (def.id) {
    case 'main_first_harvest':
      addQuest(s, 'main_meet_town');
      sendMail(s, 'mia_invite');
      break;
    case 'main_meet_town':
      addQuest(s, 'main_room_to_grow');
      sendMail(s, 'ray_room_to_grow');
      break;
  }
}

/** Called after a stage unlock to continue the story. */
export function onStageUnlocked(s: FarmState, stage: number): void {
  const next: Record<number, [string, string]> = {
    2: ['main_cold_river', 'ray_cold_river'],
    3: ['main_cats_on_the_hill', 'ray_cats'],
    4: ['main_valley_legend', 'ray_legend'],
  };
  const n = next[stage];
  if (n) {
    addQuest(s, n[0]);
    sendMail(s, n[1]);
  }
}

function offerRelationshipQuests(s: FarmState): void {
  for (const rq of RELATIONSHIP_QUESTS) {
    if (s.quests.some((q) => q.questId === rq.id)) continue;
    if (friendshipLevel(s.relations.get(rq.npc) ?? 0) < rq.level) continue;
    addQuest(s, rq.id);
    sendMail(s, 'rel_quest', {
      from: NPCS[rq.npc].name,
      title: rq.title,
      description: rq.description,
      signature: NPCS[rq.npc].name,
    });
  }
}

/** Expire yesterday's daily quests and hand out today's. */
/**
 * Today's job, re-rolled (deterministically) until it can actually be done with the
 * farm as it is this morning.
 */
export function pickDailyQuest(s: FarmState): QuestDef {
  const doable = (q: QuestDef): boolean => {
    const g = q.goals[0];
    if (!g) return true;
    switch (g.type) {
      case 'clean':
        return s.rigs.filter((r) => r.dust > 0).length >= g.count;
      case 'repaste':
        return s.rigs.some((r) => r.cpuId && r.paste < FRESH_PASTE);
      case 'harvest':
        // Rigs that will finish a cycle during today's waking hours.
        return s.rigs.filter((r) => r.cpuId && r.powered && r.progress >= 0.55).length >= g.count;
      default:
        return true;
    }
  };
  // "Say hello" and deliveries are always doable, so this ends after a few tries.
  for (let v = 0; v < 64; v++) {
    const q = dailyQuestFor(s.farm.id, s.farm.day, v);
    if (doable(q)) return q;
  }
  return dailyQuestFor(s.farm.id, s.farm.day);
}

export function rollDailyQuest(s: FarmState, questDef: QuestDef): void {
  s.quests = s.quests.filter((q) => !(q.questId.startsWith('daily_') && q.questId !== questDef.id));
  addQuest(s, questDef.id);
}

export function questDTOs(s: FarmState): QuestStateDTO[] {
  const order = (q: QuestRow) => (q.state === 'active' ? 0 : 1);
  return s.quests
    .map((q) => ({ q, def: findQuest(q.questId, s.farm.id) }))
    .filter((x): x is { q: QuestRow; def: QuestDef } => !!x.def)
    .sort((a, b) => order(a.q) - order(b.q) || (MAIN_QUESTS.indexOf(a.def) === -1 ? 1 : -1))
    .map(({ q, def }) => ({
      questId: q.questId,
      kind: def.kind,
      title: def.title,
      description: def.description,
      state: q.state,
      progress: def.goals.map((g, i) => {
        const p = q.state === 'done' ? { current: 1, target: 1 } : goalProgress(s, q, g, i);
        let text = goalText(g);
        if (g.type === 'deliver' || g.type === 'own_item')
          text = text.replace('item', getItem(g.itemId)?.name ?? g.itemId);
        if (g.type === 'own_item') text = `Own a ${getItem(g.itemId)?.name ?? g.itemId}`;
        return { text, ...p };
      }),
    }));
}
