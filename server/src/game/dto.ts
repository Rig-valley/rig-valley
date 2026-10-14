/** Build the StateDTO the client renders. */
import {
  MAX_ENERGY,
  NPC_IDS,
  calendar,
  scrapSpotsFor,
  computeTemp,
  festivalToday,
  friendshipLevel,
  powerCapacity,
  rigSpeed,
  rigStatus,
  rigWatts,
  tokenUnitsToUsd,
  totalPowerDraw,
  type RewardsSummaryDTO,
  type StateDTO,
} from '@rig-valley/shared';
import type { GameConfig } from '../configStore.js';
import type { PriceQuote } from '../rewards/price.js';
import { questDTOs } from './quests.js';
import type { FarmState } from './state.js';

export interface DtoCtx {
  config: GameConfig;
  price: PriceQuote | null;
  decimals: number;
  symbol: string;
  rewardsEnabled: boolean;
  now: number;
}

export function rewardsSummary(s: FarmState, ctx: DtoCtx): RewardsSummaryDTO {
  const price = ctx.price?.price ?? null;
  const pendingUsd = price
    ? tokenUnitsToUsd(s.pendingUnits, price, ctx.decimals) + s.backlogUsd
    : s.backlogUsd;
  const cfg = ctx.config.rewards;
  const boostLeft = Math.max(0, cfg.boostHarvestCount - s.farm.harvestCount);
  return {
    enabled: ctx.rewardsEnabled,
    symbol: ctx.symbol,
    decimals: ctx.decimals,
    pendingUnits: s.pendingUnits.toString(),
    priceUsd: price,
    pendingUsd: Math.round(pendingUsd * 1e6) / 1e6,
    minUsd: cfg.withdrawMinUsd,
    unlocked: !!price && pendingUsd >= cfg.withdrawMinUsd && s.pendingUnits > 0n,
    paused: ctx.config.withdrawalsPaused,
    backlogUsd: s.backlogUsd,
    boostLeft,
    usdPerHarvest: boostLeft > 0 ? cfg.boostUsdPerHarvest : cfg.normalUsdPerHarvest,
  };
}

export function toStateDTO(s: FarmState, ctx: DtoCtx): StateDTO {
  const f = s.farm;
  const cal = calendar(f.day);
  const env = { weather: f.weather, season: cal.season };
  const fest = festivalToday(cal.season, cal.dayOfSeason);
  return {
    serverTime: ctx.now,
    farm: {
      id: f.id,
      address: f.address,
      farmName: f.farmName,
      character: f.character,
      stage: f.stage,
      energy: f.energy,
      maxEnergy: MAX_ENERGY,
      coins: f.coins,
      day: f.day,
      minute: f.minute,
      paused: f.paused,
      weather: f.weather,
      weatherTomorrow: f.weatherTomorrow,
      powerCapacity: powerCapacity(f.powerUpgrades),
      powerDraw: totalPowerDraw(s.rigs, s.coolingUnits),
      powerUpgrades: f.powerUpgrades,
      powerKwh: Math.round(f.powerKwh * 10) / 10,
      tutorialStep: f.tutorialStep,
      harvestCount: f.harvestCount,
      boxOpened: f.flags.boxOpened,
      daily: {
        minigamePlayed: f.flags.daily.minigame,
        festivalJoined: f.flags.daily.festival,
        freeCoffee: f.flags.daily.freeCoffee,
        raceDone: f.flags.daily.race,
        scraps: scrapSpotsFor(f.id, f.day).filter(
          (i) => !(f.flags.daily.scavenged ?? []).includes(i),
        ),
      },
      ownedHats: f.flags.ownedHats,
    },
    rigs: s.rigs.map((r) => {
      const temps = computeTemp(r, s.rigs, s.coolingUnits, env);
      return { ...r, status: rigStatus(r), watts: rigWatts(r), speed: rigSpeed(r), temps };
    }),
    coolingUnits: s.coolingUnits,
    decor: s.decor,
    inventory: [...s.inventory].map(([itemId, qty]) => ({ itemId, qty })),
    relations: NPC_IDS.map((npc) => {
      const points = s.relations.get(npc) ?? 0;
      return {
        npc,
        points,
        level: friendshipLevel(points),
        talkedToday: f.flags.daily.talked.includes(npc),
        giftedToday: f.flags.daily.gifted.includes(npc),
      };
    }),
    quests: questDTOs(s),
    mail: s.mail.map((m) => ({ ...m })),
    rewards: rewardsSummary(s, ctx),
    festival: fest ? { id: fest.id, name: fest.name, description: fest.description } : null,
    rareRestock: f.flags.rareRestockDay === f.day,
  };
}
