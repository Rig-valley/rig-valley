/** API contract between client, server and admin panel. */
import type { HairColorId, HatId } from './items.js';
import type { NpcId, ShopId } from './npcs.js';
import type { CoolingUnitData, RigData, RigStatus, TempBreakdown } from './rigs.js';
import type { Weather } from './weather.js';
import type { FestivalId, RushPress } from './events.js';
import type { RewardConfig, MarketConfig, MarketQuote } from './economy.js';

export interface CharacterDTO {
  name: string;
  hair: HairColorId;
  hat: HatId;
}

export interface FarmDTO {
  id: number;
  address: string;
  farmName: string;
  character: CharacterDTO;
  stage: number;
  energy: number;
  maxEnergy: number;
  coins: number;
  day: number;
  minute: number;
  paused: boolean;
  weather: Weather;
  weatherTomorrow: Weather;
  powerCapacity: number;
  powerDraw: number;
  powerUpgrades: string[];
  /** kWh used since the last bill. */
  powerKwh: number;
  tutorialStep: number;
  harvestCount: number;
  boxOpened: boolean;
  /** Power bill Coins still owed. */
  billDebt: number;
  /** Vera cut the power over unpaid bills: rigs can't run until the debt is paid. */
  powerCut: boolean;
  /** Today's one-per-day actions. */
  daily: {
    minigamePlayed: boolean;
    festivalJoined: boolean;
    freeCoffee: boolean;
    raceDone: boolean;
    /** Scrap spots (indices into SCRAP_SPOTS) still sparkling today. */
    scraps: number[];
    /** The Coffee Rush shift in progress (started, not yet paid). */
    coffeeRush: { seed: number; startedAt: number } | null;
  };
  /** Ever-earned unlocks. */
  ownedHats: HatId[];
}

export interface RigDTO extends RigData {
  status: RigStatus;
  watts: number;
  speed: number;
  temps: TempBreakdown;
}

export interface DecorDTO {
  x: number;
  y: number;
  itemId: string;
}

export interface InventoryEntry {
  itemId: string;
  qty: number;
}

export interface RelationDTO {
  npc: NpcId;
  points: number;
  level: number;
  talkedToday: boolean;
  giftedToday: boolean;
}

export interface QuestStateDTO {
  questId: string;
  kind: 'main' | 'relationship' | 'daily';
  title: string;
  description: string;
  state: 'active' | 'done';
  /** Progress per goal (same order as the quest's goals). */
  progress: { text: string; current: number; target: number }[];
}

export interface MailDTO {
  id: number;
  day: number;
  templateId: string;
  params: Record<string, string | number>;
  read: boolean;
}

export interface RewardsSummaryDTO {
  enabled: boolean;
  symbol: string;
  decimals: number;
  pendingUnits: string;
  /** null when no price is available. */
  priceUsd: number | null;
  pendingUsd: number;
  minUsd: number;
  unlocked: boolean;
  paused: boolean;
  /** USD value of harvests not yet converted because the price feed was down. */
  backlogUsd: number;
  boostLeft: number;
  usdPerHarvest: number;
  /** Harvests that paid NVDA today (UTC day), and the daily limit (0 = no limit). */
  nvdaHarvestsToday: number;
  nvdaHarvestsPerDay: number;
  /** When the daily NVDA harvest limit resets (ms since epoch, next UTC midnight). */
  nvdaLimitResetsAt: number;
  /** New farms wait before their first withdrawal: when it opens (ms), or null when open. */
  withdrawOpensAt: number | null;
}

export interface FestivalStateDTO {
  id: FestivalId;
  name: string;
  description: string;
}

export interface StateDTO {
  serverTime: number;
  farm: FarmDTO;
  rigs: RigDTO[];
  coolingUnits: CoolingUnitData[];
  decor: DecorDTO[];
  inventory: InventoryEntry[];
  relations: RelationDTO[];
  quests: QuestStateDTO[];
  mail: MailDTO[];
  rewards: RewardsSummaryDTO;
  festival: FestivalStateDTO | null;
  /** True when the Mia rare-restock discount applies today. */
  rareRestock: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export type GameAction =
  | { type: 'open_box' }
  | { type: 'build_rig'; x: number; y: number; frameId: string }
  | { type: 'remove_rig'; rigId: number }
  | { type: 'install'; rigId: number; itemId: string }
  | { type: 'uninstall'; rigId: number; slot: 'cpu' | 'cooler' | 'psu' }
  | { type: 'swap_frame'; rigId: number; frameId: string }
  | { type: 'power'; rigId: number; on: boolean }
  | { type: 'clean'; rigId: number }
  | { type: 'repaste'; rigId: number }
  | { type: 'repair'; rigId: number }
  | { type: 'claim'; rigId: number }
  | { type: 'paint_rig'; rigId: number; itemId: string }
  | { type: 'place_cooling'; x: number; y: number; itemId: string }
  | { type: 'pickup_cooling'; x: number; y: number }
  | { type: 'place_decor'; x: number; y: number; itemId: string }
  | { type: 'pickup_decor'; x: number; y: number }
  | { type: 'sleep' }
  | { type: 'eat'; itemId: string }
  | { type: 'buy'; shopId: ShopId; itemId: string; qty: number }
  | { type: 'sell'; itemId: string; qty: number }
  | { type: 'market_buy'; itemId: string; qty: number }
  | { type: 'shop_repair'; rigId: number }
  | { type: 'power_upgrade'; upgradeId: string }
  | { type: 'talk'; npc: NpcId }
  | { type: 'gift'; npc: NpcId; itemId: string }
  | { type: 'deliver'; questId: string; npc: NpcId }
  | { type: 'read_mail'; mailId: number }
  | { type: 'delete_mail'; mailId: number }
  | { type: 'unlock_stage'; stage: number }
  | { type: 'minigame_start'; game: 'coffee_rush' }
  | { type: 'minigame'; game: 'coffee_rush'; presses: RushPress[] }
  | { type: 'pay_bill' }
  | { type: 'scavenge'; spot: number }
  | { type: 'festival_join'; giftItemId?: string }
  | { type: 'speed_race' }
  | { type: 'free_coffee' }
  | { type: 'set_hat'; hat: HatId };

export type GameEvent =
  | { kind: 'toast'; text: string; tone?: 'info' | 'good' | 'warn' | 'bad' }
  | {
      kind: 'harvest';
      rigId: number;
      coins: number;
      nvdaUnits: string;
      usd: number;
      boosted: boolean;
      /** Today's NVDA harvest limit was reached: this harvest paid Coins only. */
      capped?: boolean;
    }
  | { kind: 'dialogue'; npc: NpcId; text: string }
  | { kind: 'sleep'; summary: SleepSummary }
  | { kind: 'quest_done'; questId: string; title: string; reward: string }
  | { kind: 'level_up'; npc: NpcId; level: number; perk?: string }
  | { kind: 'mail'; count: number }
  | { kind: 'overheat'; rigId: number }
  | { kind: 'ready'; rigId: number }
  | { kind: 'stage'; stage: number; name: string }
  | { kind: 'sound'; id: string };

export interface SleepSummary {
  passedOut: boolean;
  fee: number;
  energy: number;
  day: number;
  weather: Weather;
  forecast: Weather;
  readyRigs: number;
  outage: boolean;
  tripped: boolean;
  bill: number | null;
  /** Part of this morning's bill that couldn't be paid (now owed). */
  billUnpaid: number;
  /** Vera cut the power this morning over unpaid bills. */
  powerCut: boolean;
  harvestsYesterday: number;
}

export interface ActionResponse {
  state: StateDTO;
  events: GameEvent[];
}

export interface ApiError {
  error: string;
  /** English, player-facing. */
  message: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface MeDTO {
  address: string;
  hasFarm: boolean;
  farmName?: string;
}

export interface CreateFarmRequest {
  farmName: string;
  character: CharacterDTO;
  /** Cloudflare Turnstile token, when the server asks for one (PublicConfigDTO.captchaSiteKey). */
  captchaToken?: string;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
export type WithdrawalStatus =
  | 'awaiting_signature'
  | 'signed'
  | 'submitted'
  | 'voucher_issued'
  | 'confirmed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export interface WithdrawalDTO {
  id: number;
  amountUnits: string;
  usdAtRequest: number;
  destination: string;
  status: WithdrawalStatus;
  txHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
  error: string | null;
}

export interface ChainInfoDTO {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  distributor: string | null;
  token: string | null;
  sponsoredGas: boolean;
}

export interface RewardsDTO {
  summary: RewardsSummaryDTO;
  chain: ChainInfoDTO | null;
  withdrawals: WithdrawalDTO[];
  harvests: { ts: string; usd: number; nvdaUnits: string; boosted: boolean }[];
}

export interface WithdrawPrepareDTO {
  withdrawalId: number;
  typedData: {
    domain: { name: string; version: string; chainId: number };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: 'WithdrawRequest';
    message: {
      player: string;
      destination: string;
      amount: string;
      requestId: string;
      deadline: string;
    };
  };
  amountUnits: string;
  usd: number;
}

export interface WithdrawSubmitResponse {
  withdrawal: WithdrawalDTO;
  /** Present when gas sponsorship is off: the player submits the claim themselves. */
  voucher?: {
    player: string;
    amount: string;
    nonce: string;
    expiry: string;
    signature: string;
    distributor: string;
  };
}

export interface PublicConfigDTO {
  siwe: { domain: string; uri: string; chainId: number };
  chain: ChainInfoDTO | null;
  symbol: string;
  decimals: number;
  /** Cloudflare Turnstile site key: when set, creating a farm needs a captcha token. */
  captchaSiteKey: string | null;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------
export interface MarketDTO {
  day: number;
  quotes: MarketQuote[];
  sellBonus: number;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export interface AdminConfigDTO {
  rewards: RewardConfig;
  market: MarketConfig;
  withdrawalsPaused: boolean;
  alertThresholdUnits: string;
  /** Alert when the gas relayer's ETH balance is below this (wei). */
  relayerAlertWei: string;
}

export interface AdminDashboardDTO {
  symbol: string;
  decimals: number;
  priceUsd: number | null;
  priceUpdatedAt: string | null;
  paidTodayUnits: string;
  paidWeekUnits: string;
  pendingLiabilitiesUnits: string;
  withdrawalsToday: number;
  withdrawalsWeek: number;
  withdrawalsPending: number;
  contractBalanceUnits: string | null;
  contractPaused: boolean | null;
  lowBalanceAlert: boolean;
  /** Gas relayer: address and ETH balance (wei), null when there is no relayer. */
  relayerAddress: string | null;
  relayerBalanceWei: string | null;
  lowRelayerAlert: boolean;
  withdrawalsPaused: boolean;
  players: number;
  harvestsToday: number;
  chain: ChainInfoDTO | null;
  alerts: { level: 'warn' | 'bad'; text: string }[];
}

export interface AdminPlayerDTO {
  state: StateDTO;
  harvests: {
    ts: string;
    rigId: number;
    coins: number;
    usd: number;
    nvdaUnits: string;
    priceUsed: number | null;
    boosted: boolean;
  }[];
  withdrawals: WithdrawalDTO[];
  coinsLedger: { ts: string; delta: number; reason: string }[];
}
