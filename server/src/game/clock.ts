/**
 * Server-authoritative clock (MASTERPLAN §6).
 * Time only advances while the player is connected and not in a menu.
 * Each tick covers at most MAX_TICK_GAP_MS of real time: offline = frozen world.
 */
import {
  DAY_END_MINUTE,
  MAX_TICK_GAP_MS,
  calendar,
  gameMinutesFromRealMs,
  kwh,
  simulateRigs,
  totalPowerDraw,
} from '@rig-valley/shared';
import type { EngineCtx } from './helpers.js';
import { sleep } from './overnight.js';
import type { FarmState } from './state.js';

export function advanceClock(s: FarmState, ctx: EngineCtx): void {
  const f = s.farm;
  const last = f.lastTickAt;
  f.lastTickAt = ctx.now;
  if (last === null || f.paused) return;
  const realMs = Math.min(Math.max(0, ctx.now - last), MAX_TICK_GAP_MS);
  if (realMs <= 0) return;
  let minutes = gameMinutesFromRealMs(realMs);

  const untilEnd = DAY_END_MINUTE - f.minute;
  const passOut = minutes >= untilEnd;
  if (passOut) minutes = Math.max(0, untilEnd);

  runMinutes(s, ctx, minutes);
  f.minute += minutes;

  if (passOut) sleep(s, ctx, true);
}

/** Simulate rigs and power use for daytime minutes. */
export function runMinutes(s: FarmState, ctx: EngineCtx, minutes: number): void {
  if (minutes <= 0) return;
  const f = s.farm;
  const draw = totalPowerDraw(s.rigs, s.coolingUnits);
  f.powerKwh += kwh(draw, minutes);
  const events = simulateRigs(
    s.rigs,
    s.coolingUnits,
    { weather: f.weather, season: seasonOf(f.day), powerOff: false },
    minutes,
  );
  for (const e of events) {
    if (e.kind === 'overheat') ctx.events.push({ kind: 'overheat', rigId: e.rigId });
    if (e.kind === 'ready') ctx.events.push({ kind: 'ready', rigId: e.rigId });
  }
}

function seasonOf(day: number) {
  return calendar(day).season;
}
