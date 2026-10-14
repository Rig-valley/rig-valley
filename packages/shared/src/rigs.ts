/**
 * Rig simulation (MASTERPLAN §7). Pure functions shared by the server
 * (authoritative) and the client (previews / tooltips only).
 */
import {
  STOCK_COOLER,
  STOCK_PSU,
  getItem,
  isCooler,
  isCoolingUnit,
  isCpu,
  isFrame,
  isPsu,
  rarityRank,
  type CpuItem,
  type FrameItem,
  type Item,
  type RigPaint,
} from './items.js';
import { SEASON_TEMP, WEATHER_INFO, type Weather } from './weather.js';
import type { Season } from './time.js';
import { slotAt, slotDistance, type SlotRef } from './world.js';

export interface RigData {
  id: number;
  x: number;
  y: number;
  frameId: string;
  cpuId: string | null;
  coolerId: string | null;
  psuId: string | null;
  /** Health 0..100. 0 = broken. */
  condition: number;
  /** Dust 0..100. */
  dust: number;
  /** Thermal paste quality 0..100. */
  paste: number;
  /** Last computed temperature (°C). */
  temp: number;
  /** Harvest cycle progress 0..1. 1 = ready to claim. */
  progress: number;
  powered: boolean;
  /** Game minutes of booting left. */
  bootRemaining: number;
  overheat: boolean;
  paint: RigPaint;
  /** The tutorial rig harvests the morning after it is first powered on. */
  tutorial: boolean;
}

export interface CoolingUnitData {
  x: number;
  y: number;
  itemId: string;
}

export interface RigEnv {
  weather: Weather;
  season: Season;
  /** Breaker tripped or power outage: all rigs stop. */
  powerOff: boolean;
}

export type RigStatus =
  | 'frame' // no CPU yet
  | 'installed' // CPU installed, not powered
  | 'booting'
  | 'mining'
  | 'ready'
  | 'overheat'
  | 'broken'
  | 'off'; // power outage / breaker

export const RIG_STATUS_LABEL: Record<RigStatus, string> = {
  frame: 'Needs a CPU',
  installed: 'Powered off',
  booting: 'Booting',
  mining: 'Mining',
  ready: 'Ready to claim',
  overheat: 'Overheat',
  broken: 'Broken',
  off: 'No Power',
};

export const AMBIENT_TEMP = 28;
export const SLOW_TEMP = 80;
export const OVERHEAT_TEMP = 95;
export const NEIGHBOR_HEAT = 4;
export const BOOT_MINUTES = 30;
export const LOW_CONDITION = 25;

/** Energy cost per action (MASTERPLAN §7). */
export const ENERGY_COST = {
  clean: 2,
  repaste: 4,
  repair: 8,
  build: 10,
  install: 10,
} as const;

/** Paste at or above this is still fresh: repasting would waste a tube. */
export const FRESH_PASTE = 95;

/** Health restored by a screwdriver repair. */
export const SCREWDRIVER_REPAIR = 35;

/** Daily wear, applied overnight. */
export const DAILY_WEAR = {
  condition: 2,
  hotCondition: 3, // extra when the rig ran hot (> SLOW_TEMP)
  dust: 12,
  stormDust: 6,
  paste: 6,
} as const;

export function rigCpu(rig: RigData): CpuItem | undefined {
  const i = rig.cpuId ? getItem(rig.cpuId) : undefined;
  return isCpu(i) ? i : undefined;
}

export function rigFrame(rig: RigData): FrameItem {
  const i = getItem(rig.frameId);
  if (!isFrame(i)) throw new Error(`Rig ${rig.id} has invalid frame ${rig.frameId}`);
  return i;
}

export function rigCooling(rig: RigData): { cooling: number; watts: number; name: string } {
  const i = rig.coolerId ? getItem(rig.coolerId) : undefined;
  return isCooler(i) ? i : STOCK_COOLER;
}

export function rigPsuEfficiency(rig: RigData): number {
  const i = rig.psuId ? getItem(rig.psuId) : undefined;
  return isPsu(i) ? i.efficiency : STOCK_PSU.efficiency;
}

/** A rig is "active" when it is powered and able to work (counts for heat and stage requirements). */
export function isRigActive(rig: RigData): boolean {
  return rig.powered && !!rig.cpuId && rig.condition > 0 && !rig.overheat;
}

export function rigStatus(rig: RigData, env?: Pick<RigEnv, 'powerOff'>): RigStatus {
  if (!rig.cpuId) return 'frame';
  if (rig.condition <= 0) return 'broken';
  if (rig.overheat) return 'overheat';
  if (!rig.powered) return 'installed';
  if (env?.powerOff) return 'off';
  if (rig.progress >= 1) return 'ready';
  if (rig.bootRemaining > 0) return 'booting';
  return 'mining';
}

/** Watts drawn by a rig. */
export function rigWatts(rig: RigData): number {
  const cpu = rigCpu(rig);
  if (!rig.powered || !cpu) return 0;
  return Math.round(cpu.watts * rigPsuEfficiency(rig) + rigCooling(rig).watts);
}

export function coolingUnitWatts(cu: CoolingUnitData): number {
  const i = getItem(cu.itemId);
  return isCoolingUnit(i) ? i.watts : 0;
}

export function totalPowerDraw(
  rigs: readonly RigData[],
  units: readonly CoolingUnitData[],
): number {
  return (
    rigs.reduce((s, r) => s + rigWatts(r), 0) + units.reduce((s, u) => s + coolingUnitWatts(u), 0)
  );
}

/** Harvests per in-game day. Displayed as "Speed". */
export function rigSpeed(rig: RigData): number {
  const cpu = rigCpu(rig);
  return cpu ? 1 / cpu.cycleDays : 0;
}

export function harvestCoins(rig: RigData): number {
  const cpu = rigCpu(rig);
  if (!cpu) return 0;
  return Math.round(cpu.coins * rigFrame(rig).coinBonus);
}

export function ambientTemp(env: Pick<RigEnv, 'weather' | 'season'>): number {
  return AMBIENT_TEMP + WEATHER_INFO[env.weather].temp + SEASON_TEMP[env.season];
}

export interface TempBreakdown {
  total: number;
  ambient: number;
  cpu: number;
  cooler: number;
  frame: number;
  field: number;
  coolingUnits: number;
  neighbors: number;
  dust: number;
  paste: number;
}

/**
 * temp = base + cpu_heat − cooler_power − cooling_units_in_range + weather_modifier + neighbor_penalty
 * (+ casing, river cooling, dust and worn paste).
 */
export function computeTemp(
  rig: RigData,
  rigs: readonly RigData[],
  units: readonly CoolingUnitData[],
  env: Pick<RigEnv, 'weather' | 'season'>,
): TempBreakdown {
  const ambient = ambientTemp(env);
  const cpu = rigCpu(rig);
  const zero: TempBreakdown = {
    total: ambient,
    ambient,
    cpu: 0,
    cooler: 0,
    frame: 0,
    field: 0,
    coolingUnits: 0,
    neighbors: 0,
    dust: 0,
    paste: 0,
  };
  if (!cpu || !rig.powered || rig.condition <= 0) return zero;

  const slot = slotAt(rig.x, rig.y);
  const cooler = rigCooling(rig).cooling;
  const frame = rigFrame(rig).cooling;
  const field = slot?.field.cooling ?? 0;

  let unitCooling = 0;
  let neighbors = 0;
  if (slot) {
    for (const u of units) {
      const us = slotAt(u.x, u.y);
      const item = getItem(u.itemId);
      if (!us || !isCoolingUnit(item)) continue;
      if (slotDistance(slot, us) <= item.radius) unitCooling += item.cooling;
    }
    for (const other of rigs) {
      if (other.id === rig.id || !isRigActive(other)) continue;
      const os = slotAt(other.x, other.y);
      if (os && slotDistance(slot, os) <= 1) neighbors++;
    }
  }
  const dust = rig.dust * 0.15;
  const paste = (100 - rig.paste) * 0.12;
  const neighborHeat = neighbors * NEIGHBOR_HEAT;
  const total =
    ambient + cpu.heat - cooler - frame - field - unitCooling + neighborHeat + dust + paste;
  return {
    total: Math.round(total * 10) / 10,
    ambient,
    cpu: cpu.heat,
    cooler,
    frame,
    field,
    coolingUnits: unitCooling,
    neighbors: neighborHeat,
    dust: Math.round(dust * 10) / 10,
    paste: Math.round(paste * 10) / 10,
  };
}

/** Cycle progress per game minute at a given temperature. */
export function progressPerMinute(rig: RigData, temp: number): number {
  const cpu = rigCpu(rig);
  if (!cpu) return 0;
  let rate = 1 / (cpu.cycleDays * 24 * 60);
  if (temp > SLOW_TEMP) rate *= 0.5;
  if (rig.condition < LOW_CONDITION) rate *= 0.75;
  return rate;
}

export interface SimEvent {
  kind: 'ready' | 'overheat' | 'booted';
  rigId: number;
}

/**
 * Advance all rigs by `minutes` of game time. Mutates rigs. Returns notable events.
 */
export function simulateRigs(
  rigs: RigData[],
  units: readonly CoolingUnitData[],
  env: RigEnv,
  minutes: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (minutes <= 0) return events;
  // Temperatures depend on neighbors, compute them all first.
  const temps = new Map<number, number>();
  for (const rig of rigs) temps.set(rig.id, computeTemp(rig, rigs, units, env).total);

  for (const rig of rigs) {
    const temp = temps.get(rig.id)!;
    rig.temp = temp;
    if (env.powerOff) continue;
    if (!isRigActive(rig)) continue;
    if (temp > OVERHEAT_TEMP) {
      rig.overheat = true;
      events.push({ kind: 'overheat', rigId: rig.id });
      continue;
    }
    let left = minutes;
    if (rig.bootRemaining > 0) {
      const used = Math.min(rig.bootRemaining, left);
      rig.bootRemaining -= used;
      left -= used;
      if (rig.bootRemaining <= 0) {
        rig.bootRemaining = 0;
        events.push({ kind: 'booted', rigId: rig.id });
      }
    }
    if (left <= 0 || rig.progress >= 1) continue;
    rig.progress = Math.min(1, rig.progress + progressPerMinute(rig, temp) * left);
    if (rig.progress >= 1) events.push({ kind: 'ready', rigId: rig.id });
  }
  return events;
}

/** Overnight wear and tear. Mutates the rig. */
export function applyOvernightWear(rig: RigData, weather: Weather): void {
  if (!rig.cpuId) return;
  const slot = slotAt(rig.x, rig.y);
  if (slot?.field.drones) {
    // Service drones keep data center rigs spotless.
    rig.dust = 0;
    rig.paste = Math.max(rig.paste, 90);
    rig.condition = Math.min(100, rig.condition + 10);
    rig.overheat = false;
    return;
  }
  if (rig.powered) {
    const dust = !WEATHER_INFO[weather].dust
      ? 0
      : weather === 'storm'
        ? DAILY_WEAR.stormDust
        : DAILY_WEAR.dust;
    rig.dust = Math.min(100, rig.dust + dust);
    rig.paste = Math.max(0, rig.paste - DAILY_WEAR.paste);
    const wear = DAILY_WEAR.condition + (rig.temp > SLOW_TEMP ? DAILY_WEAR.hotCondition : 0);
    rig.condition = Math.max(0, rig.condition - wear);
  }
}

export type PartSlot = 'cpu' | 'cooler' | 'psu';

export function partSlotOf(item: Item): PartSlot | undefined {
  if (item.type === 'cpu') return 'cpu';
  if (item.type === 'cooler') return 'cooler';
  if (item.type === 'psu') return 'psu';
  return undefined;
}

/** Can this part be installed in this rig's frame? */
export function canInstall(rig: RigData, item: Item): { ok: true } | { ok: false; reason: string } {
  const slot = partSlotOf(item);
  if (!slot || !item.rarity) return { ok: false, reason: "That isn't a rig part." };
  const frame = rigFrame(rig);
  if (rarityRank(item.rarity) > rarityRank(frame.maxRarity)) {
    return {
      ok: false,
      reason: `A ${frame.name} can't hold ${item.rarity} parts. Upgrade the frame first.`,
    };
  }
  return { ok: true };
}

export function newRig(id: number, x: number, y: number, frameId: string): RigData {
  return {
    id,
    x,
    y,
    frameId,
    cpuId: null,
    coolerId: null,
    psuId: null,
    condition: 100,
    dust: 0,
    paste: 100,
    temp: AMBIENT_TEMP,
    progress: 0,
    powered: false,
    bootRemaining: 0,
    overheat: false,
    paint: 'steel',
    tutorial: false,
  };
}

export function slotOfRig(rig: RigData): SlotRef | undefined {
  return slotAt(rig.x, rig.y);
}
