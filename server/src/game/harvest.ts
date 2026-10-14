/** Harvest: pays Coins + NVDA (MASTERPLAN §7, §9). NVDA is the only on-chain reward and only comes from rigs. */
import {
  harvestCoins,
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
  const harvestNumber = s.farm.harvestCount + 1;
  const { usd, boosted } = usdForHarvest(ctx.config.rewards, harvestNumber);

  // Convert USD → NVDA at harvest time. If the feed is down, keep the USD owed and convert later.
  const quote = await ctx.price();
  let units = 0n;
  if (quote) {
    const backlog = s.backlogUsd;
    units = usdToTokenUnits(usd + backlog, quote.price, ctx.decimals);
    s.backlogUsd = 0;
  } else {
    s.backlogUsd = Math.round((s.backlogUsd + usd) * 1e6) / 1e6;
  }
  s.pendingUnits += units;

  rig.progress = 0;
  rig.tutorial = false;
  s.farm.harvestCount = harvestNumber;
  s.farm.flags.daily.harvests += 1;
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
  });
  signalQuests(s, ctx, { type: 'harvest' });
}
