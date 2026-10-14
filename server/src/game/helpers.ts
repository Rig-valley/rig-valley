/** Small mutation helpers shared by engine modules. */
import {
  FRIENDSHIP_PER_LEVEL,
  MAX_ENERGY,
  NPCS,
  friendshipLevel,
  getItem,
  requireItem,
  type GameEvent,
  type NpcId,
  type RigData,
} from '@rig-valley/shared';
import type { Queryable } from '../db/index.js';
import type { GameConfig } from '../configStore.js';
import type { PriceQuote } from '../rewards/price.js';
import { TOO_TIRED, fail } from '../errors.js';
import type { FarmState } from './state.js';

export interface EngineCtx {
  q: Queryable;
  now: number;
  config: GameConfig;
  price: () => Promise<PriceQuote | null>;
  decimals: number;
  events: GameEvent[];
}

export function itemQty(s: FarmState, itemId: string): number {
  return s.inventory.get(itemId) ?? 0;
}

export function addItem(s: FarmState, itemId: string, qty = 1): void {
  requireItem(itemId);
  const item = getItem(itemId)!;
  if (item.type === 'outfit' && item.value) {
    const hat = item.value as FarmState['farm']['flags']['ownedHats'][number];
    if (!s.farm.flags.ownedHats.includes(hat)) s.farm.flags.ownedHats.push(hat);
    return;
  }
  s.inventory.set(itemId, itemQty(s, itemId) + qty);
}

export function takeItem(s: FarmState, itemId: string, qty = 1, message?: string): void {
  const have = itemQty(s, itemId);
  if (have < qty) {
    const name = getItem(itemId)?.name ?? itemId;
    fail('missing_item', message ?? `You need ${qty > 1 ? `${qty}× ` : 'a '}${name}.`);
  }
  if (have - qty <= 0) s.inventory.delete(itemId);
  else s.inventory.set(itemId, have - qty);
}

export function requireTool(s: FarmState, itemId: string, message: string): void {
  if (itemQty(s, itemId) < 1) fail('missing_tool', message);
}

export function addCoins(s: FarmState, delta: number, reason: string): void {
  if (delta === 0) return;
  s.farm.coins += delta;
  s.ledger.push({ delta, reason });
}

export function spendCoins(s: FarmState, amount: number, reason: string): void {
  if (s.farm.coins < amount)
    fail('no_coins', `You need ${amount.toLocaleString('en-US')} Coins for that.`);
  addCoins(s, -amount, reason);
}

export function spendEnergy(s: FarmState, amount: number): void {
  if (s.farm.energy < amount) fail('tired', TOO_TIRED);
  s.farm.energy -= amount;
}

export function addEnergy(s: FarmState, amount: number): number {
  const before = s.farm.energy;
  s.farm.energy = Math.min(MAX_ENERGY, s.farm.energy + amount);
  return s.farm.energy - before;
}

export function sendMail(
  s: FarmState,
  templateId: string,
  params: Record<string, string | number> = {},
): void {
  s.newMail.push({ templateId, params });
}

export function findRig(s: FarmState, rigId: number): RigData {
  const rig = s.rigs.find((r) => r.id === rigId);
  if (!rig) fail('no_rig', "That rig doesn't exist anymore.");
  return rig;
}

export function tileOccupied(s: FarmState, x: number, y: number): boolean {
  return (
    s.rigs.some((r) => r.x === x && r.y === y) ||
    s.coolingUnits.some((c) => c.x === x && c.y === y) ||
    s.decor.some((d) => d.x === x && d.y === y)
  );
}

/** Add friendship points; emits level-up events and grants level perks. */
export function addFriendship(s: FarmState, ctx: EngineCtx, npc: NpcId, points: number): void {
  const before = s.relations.get(npc) ?? 0;
  const after = Math.max(0, Math.min(5 * FRIENDSHIP_PER_LEVEL + 99, before + points));
  s.relations.set(npc, after);
  const lb = friendshipLevel(before);
  const la = friendshipLevel(after);
  for (let lvl = lb + 1; lvl <= la; lvl++) {
    const perk = NPCS[npc].perks[lvl as 1 | 2 | 3 | 4 | 5];
    ctx.events.push({ kind: 'level_up', npc, level: lvl, perk });
    grantLevelGift(s, npc, lvl);
  }
}

function grantLevelGift(s: FarmState, npc: NpcId, level: number): void {
  const id = `${npc}_${level}`;
  if (s.farm.flags.perksGranted.includes(id)) return;
  const gifts: Record<string, { itemId: string; subject: string; body: string }> = {
    kai_3: {
      itemId: 'paint_gold',
      subject: 'Fine, you win',
      body: "Okay, your rigs are cool. Here's some gold paint. Makes everything look faster.",
    },
    kai_5: {
      itemId: 'cooler_epic',
      subject: 'Take it',
      body: "I've got three of these. Don't tell anyone I'm nice.",
    },
    bo_2: {
      itemId: 'energy_drink',
      subject: 'On the house',
      body: 'A little something for my favorite customer. Drink responsibly. Or fast.',
    },
  };
  const g = gifts[id];
  if (!g) return;
  s.farm.flags.perksGranted.push(id);
  addItem(s, g.itemId, 1);
  sendMail(s, 'perk_gift', {
    from: NPCS[npc].name,
    subject: g.subject,
    body: g.body,
    item: getItem(g.itemId)!.name,
  });
}

export function toast(
  ctx: EngineCtx,
  text: string,
  tone: 'info' | 'good' | 'warn' | 'bad' = 'info',
): void {
  ctx.events.push({ kind: 'toast', text, tone });
}
