/** Request validation. Anything not matching is rejected before reaching the engine. */
import { z } from 'zod';
import { HAIR_COLORS, HATS, NPC_IDS } from '@rig-valley/shared';

const int = z.number().int().min(-10_000).max(10_000);
const tile = z.number().int().min(0).max(200);
const itemId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/);
const npc = z.enum(NPC_IDS as [string, ...string[]]);
const shop = z.enum(['hardware', 'cafe', 'repair', 'substation', 'market']);
const hat = z.enum(HATS.map((h) => h.id) as [string, ...string[]]);
const rigId = z.number().int().positive();

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_box') }),
  z.object({ type: z.literal('build_rig'), x: tile, y: tile, frameId: itemId }),
  z.object({ type: z.literal('remove_rig'), rigId }),
  z.object({ type: z.literal('install'), rigId, itemId }),
  z.object({ type: z.literal('uninstall'), rigId, slot: z.enum(['cpu', 'cooler', 'psu']) }),
  z.object({ type: z.literal('swap_frame'), rigId, frameId: itemId }),
  z.object({ type: z.literal('power'), rigId, on: z.boolean() }),
  z.object({ type: z.literal('clean'), rigId }),
  z.object({ type: z.literal('repaste'), rigId }),
  z.object({ type: z.literal('repair'), rigId }),
  z.object({ type: z.literal('claim'), rigId }),
  z.object({ type: z.literal('paint_rig'), rigId, itemId }),
  z.object({ type: z.literal('place_cooling'), x: tile, y: tile, itemId }),
  z.object({ type: z.literal('pickup_cooling'), x: tile, y: tile }),
  z.object({ type: z.literal('place_decor'), x: tile, y: tile, itemId }),
  z.object({ type: z.literal('pickup_decor'), x: tile, y: tile }),
  z.object({ type: z.literal('sleep') }),
  z.object({ type: z.literal('eat'), itemId }),
  z.object({ type: z.literal('buy'), shopId: shop, itemId, qty: int }),
  z.object({ type: z.literal('sell'), itemId, qty: int }),
  z.object({ type: z.literal('market_buy'), itemId, qty: int }),
  z.object({ type: z.literal('shop_repair'), rigId }),
  z.object({ type: z.literal('power_upgrade'), upgradeId: z.string().max(40) }),
  z.object({ type: z.literal('talk'), npc }),
  z.object({ type: z.literal('gift'), npc, itemId }),
  z.object({ type: z.literal('deliver'), questId: z.string().max(60), npc }),
  z.object({ type: z.literal('read_mail'), mailId: z.number().int().positive() }),
  z.object({ type: z.literal('delete_mail'), mailId: z.number().int().positive() }),
  z.object({ type: z.literal('unlock_stage'), stage: z.number().int().min(2).max(4) }),
  z.object({
    type: z.literal('minigame'),
    game: z.literal('coffee_rush'),
    score: z.number().int().min(0).max(100),
    perfect: z.number().int().min(0).max(100).optional(),
  }),
  z.object({ type: z.literal('scavenge'), spot: z.number().int().min(0).max(999) }),
  z.object({ type: z.literal('festival_join'), giftItemId: itemId.optional() }),
  z.object({ type: z.literal('speed_race') }),
  z.object({ type: z.literal('free_coffee') }),
  z.object({ type: z.literal('set_hat'), hat }),
]);

export const createFarmSchema = z.object({
  farmName: z.string().min(1).max(40),
  character: z.object({
    name: z.string().min(1).max(30),
    hair: z.enum(HAIR_COLORS.map((h) => h.id) as [string, ...string[]]),
    hat: z.enum(['none', 'cap', 'beanie', 'straw']),
  }),
});

export const verifySchema = z.object({
  message: z.string().min(10).max(4000),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(4000),
});

export const tickSchema = z.object({ paused: z.boolean() });

const unitsString = z.string().regex(/^\d{1,78}$/);
const seasonMods = z.record(z.string(), z.number().min(0.1).max(5));

export const adminConfigSchema = z.object({
  rewards: z
    .object({
      normalUsdPerHarvest: z.number().min(0).max(10),
      boostUsdPerHarvest: z.number().min(0).max(10),
      boostHarvestCount: z.number().int().min(0).max(10_000),
      withdrawMinUsd: z.number().min(0.01).max(10_000),
    })
    .optional(),
  market: z
    .object({
      basePrices: z.record(z.string(), z.number().int().min(1).max(10_000_000)),
      seasonalModifiers: z.object({
        spring: seasonMods,
        summer: seasonMods,
        fall: seasonMods,
        winter: seasonMods,
      }),
      dailySwing: z.number().min(0).max(0.9),
      sellRatio: z.number().min(0.05).max(1),
    })
    .optional(),
  withdrawalsPaused: z.boolean().optional(),
  alertThresholdUnits: unitsString.optional(),
});
