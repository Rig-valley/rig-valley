/**
 * Sleep and overnight processing (MASTERPLAN §6): advance rig cycles, apply
 * condition decay and dust, roll tomorrow's weather, accrue the power bill,
 * update pending rewards and deliver mail.
 */
import {
  DAY_START_MINUTE,
  MIDNIGHT_MINUTE,
  MINUTES_PER_DAY,
  PASS_OUT_ENERGY,
  PASS_OUT_FEE,
  POWER_BILL_WEEKDAY,
  POWER_PRICE_PER_KWH,
  WEATHER_INFO,
  applyOvernightWear,
  billMultiplier,
  calendar,
  energyAfterSleep,
  festivalToday,
  friendshipLevel,
  kwh,
  powerBillDiscount,
  powerCapacity,
  rigStatus,
  rollWeather,
  seeded,
  simulateRigs,
  totalPowerDraw,
  type SleepSummary,
} from '@rig-valley/shared';
import { addCoins, itemQty, sendMail, type EngineCtx } from './helpers.js';
import { pickDailyQuest, rewardText, rollDailyQuest } from './quests.js';
import { defaultDaily, type FarmState } from './state.js';

export function sleep(s: FarmState, ctx: EngineCtx, passedOut: boolean): SleepSummary {
  const f = s.farm;
  const bedMinute = Math.min(f.minute, MIDNIGHT_MINUTE + 120);
  const nightMinutes = Math.max(0, MINUTES_PER_DAY + DAY_START_MINUTE - bedMinute);
  const cal = calendar(f.day);
  const nightWeather = f.weather;

  // --- Power: breaker and weather outages ---
  const draw = totalPowerDraw(s.rigs, s.coolingUnits);
  const capacity = powerCapacity(f.powerUpgrades);
  const tripped = draw > capacity;
  const shielded = itemQty(s, 'surge_shield') > 0;
  const outage =
    !tripped && !shielded && seeded('outage', f.id, f.day) < WEATHER_INFO[f.weather].outageChance;
  const powerOff = tripped || outage;

  // --- Rig cycles through the night ---
  simulateRigs(
    s.rigs,
    s.coolingUnits,
    { weather: f.weather, season: cal.season, powerOff },
    nightMinutes,
  );
  if (!powerOff) f.powerKwh += kwh(draw, nightMinutes);

  // The tutorial rig harvests the next morning so the first claim comes fast (MASTERPLAN §5.6).
  for (const rig of s.rigs) {
    if (rig.tutorial && rig.powered && rig.cpuId && !rig.overheat && rig.condition > 0) {
      rig.progress = 1;
      rig.bootRemaining = 0;
    }
  }

  // --- Wear and tear ---
  for (const rig of s.rigs) applyOvernightWear(rig, f.weather);

  // --- New day ---
  const harvestsYesterday = f.flags.daily.harvests;
  f.day += 1;
  f.minute = DAY_START_MINUTE;
  f.weather = f.weatherTomorrow;
  f.weatherTomorrow = rollWeather(calendar(f.day + 1).season, seeded('weather', f.id, f.day + 1));
  const fee = passedOut ? Math.min(f.coins, PASS_OUT_FEE) : 0;
  f.energy = passedOut ? PASS_OUT_ENERGY : energyAfterSleep(bedMinute);
  if (fee > 0) addCoins(s, -fee, 'passed_out');
  f.flags.daily = defaultDaily(f.day);
  f.flags.harvestsYesterday = harvestsYesterday;
  if (f.tutorialStep >= 5) f.flags.tutorialSlept = true;
  // Pause until the client resumes, so the morning summary doesn't eat game time.
  f.paused = true;

  const today = calendar(f.day);
  const friendship = Object.fromEntries(s.relations);

  // --- Weekly power bill (Monday mornings) ---
  let bill: number | null = null;
  if (today.weekdayIndex === POWER_BILL_WEEKDAY && f.day > 1) {
    const used = Math.round(f.powerKwh * 10) / 10;
    const cost =
      Math.ceil(
        f.powerKwh *
          POWER_PRICE_PER_KWH *
          billMultiplier(f.powerUpgrades) *
          powerBillDiscount({ stage: f.stage, friendship }),
      ) + f.flags.billDebt;
    const paid = Math.min(cost, Math.max(0, f.coins));
    const unpaid = cost - paid;
    if (paid > 0) addCoins(s, -paid, 'power_bill');
    f.flags.billDebt = unpaid;
    f.powerKwh = 0;
    bill = cost;
    sendMail(s, 'power_bill', {
      kwh: used.toLocaleString('en-US'),
      coins: cost.toLocaleString('en-US'),
      unpaid,
    });
  }

  // --- Mail ---
  if (passedOut) sendMail(s, 'passed_out', { fee });
  if (tripped) sendMail(s, 'breaker_tripped', { draw, capacity });
  if (outage) sendMail(s, 'outage', { weather: WEATHER_INFO[nightWeather].name.toLowerCase() });

  // Yesterday's job letters are expired: clear them so the mailbox stays tidy.
  for (const m of s.mail.filter((x) => x.templateId === 'daily_quest' && x.day < f.day)) {
    s.deletedMail.push(m.id);
  }
  s.mail = s.mail.filter((x) => !(x.templateId === 'daily_quest' && x.day < f.day));
  const daily = pickDailyQuest(s);
  rollDailyQuest(s, daily);
  sendMail(s, 'daily_quest', {
    title: daily.title,
    description: daily.description,
    reward: rewardText(daily.reward),
  });

  const festival = festivalToday(today.season, today.dayOfSeason);
  if (festival)
    sendMail(s, 'event_news', { name: festival.name, description: festival.description });

  if (friendshipLevel(s.relations.get('bo') ?? 0) >= 1 && seeded('bo-tip', f.id, f.day) < 0.35) {
    sendMail(s, 'weather_tip', { forecast: WEATHER_INFO[f.weatherTomorrow].forecast });
  }
  if (
    friendshipLevel(s.relations.get('mia') ?? 0) >= 3 &&
    f.stage >= 3 &&
    seeded('restock', f.id, f.day) < 0.2
  ) {
    f.flags.rareRestockDay = f.day;
    sendMail(s, 'rare_restock');
  }

  const summary: SleepSummary = {
    passedOut,
    fee,
    energy: f.energy,
    day: f.day,
    weather: f.weather,
    forecast: f.weatherTomorrow,
    readyRigs: s.rigs.filter((r) => rigStatus(r) === 'ready').length,
    outage,
    tripped,
    bill,
    harvestsYesterday,
  };
  ctx.events.push({ kind: 'sleep', summary });
  ctx.events.push({ kind: 'mail', count: s.newMail.length });
  return summary;
}
