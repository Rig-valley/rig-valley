/** Harvest: pays Coins + NVDA (MASTERPLAN §7, §9). NVDA is the only on-chain reward and only comes from rigs. */
import {
  harvestCoins,
  rewardDay,
  rigStatus,
  usdForHarvest,
  usdToTokenUnits,
  type RigData,
} from '@rig-valley/shared';
import { fail } from '../errors.js';
import { addCoins, type EngineCtx } from './helpers.js';
import { signalQuests } from './quests.js';
import type { FarmState } from './state.js';

export async function harvestRig(s: FarmState, ctx: EngineCtx, rig: RigData): Promise<void> {
  if (rigStatus(rig) !== 'ready') fail('not_ready', "This rig isn't ready yet.");
  const coins = harvestCoins(rig);
  const f = s.farm;
  const cfg = ctx.config.rewards;

  // Daily NVDA limit per farm (real UTC day): past it, harvests pay Coins only. Game time can
  // be sped up by playing a lot, so this is what keeps the reward budget tied to real time.
  const today = rewardDay(ctx.now);
  if (f.flags.nvdaDay !== today) {
    f.flags.nvdaDay = today;
    f.flags.nvdaHarvests = 0;
  }
  const capped = cfg.dailyNvdaHarvests > 0 && f.flags.nvdaHarvests >= cfg.dailyNvdaHarvests;

  // Coins-only harvests don't use up the beginner boost.
  const paidNumber = f.harvestCount - f.flags.coinOnlyHarvests + 1;
  const { usd, boosted } = capped ? { usd: 0, boosted: false } : usdForHarvest(cfg, paidNumber);

  // Convert USD → NVDA at harvest time. If the feed is down, keep the USD owed and convert later.
  const quote = capped ? null : await ctx.price();
  let units = 0n;
  if (capped) {
    f.flags.coinOnlyHarvests += 1;
  } else if (quote) {
    const backlog = s.backlogUsd;
    units = usdToTokenUnits(usd + backlog, quote.price, ctx.decimals);
    s.backlogUsd = 0;
  } else {
    s.backlogUsd = Math.round((s.backlogUsd + usd) * 1e6) / 1e6;
  }
  if (!capped) f.flags.nvdaHarvests += 1;
  s.pendingUnits += units;

  rig.progress = 0;
  rig.tutorial = false;
  f.harvestCount += 1;
  f.flags.daily.harvests += 1;
  addCoins(s, coins, `harvest:rig${rig.id}`);
  s.harvests.push({
    rigId: rig.id,
    coins,
    usd,
    nvdaUnits: units,
    priceUsed: quote?.price ?? null,
    boosted,
  });
  ctx.events.push({
    kind: 'harvest',
    rigId: rig.id,
    coins,
    nvdaUnits: units.toString(),
    usd,
    boosted,
    ...(capped ? { capped: true } : {}),
  });
  signalQuests(s, ctx, { type: 'harvest' });
}
