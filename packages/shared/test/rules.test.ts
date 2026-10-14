import { describe, expect, it } from 'vitest';
import {
  calendar,
  formatClock,
  slotAt,
  newRig,
  computeTemp,
  simulateRigs,
  rigStatus,
  usdToTokenUnits,
  tokenUnitsToUsd,
  formatTokenUnits,
  marketQuote,
  DEFAULT_MARKET_CONFIG,
  energyAfterSleep,
  powerCapacity,
  rigWatts,
  canInstall,
  requireItem,
  dailyQuestFor,
  ITEMS,
  PALETTE,
  validateFarmName,
  applyOvernightWear,
} from '../src/index.js';

describe('calendar', () => {
  it('maps days to seasons and weekdays', () => {
    expect(calendar(1)).toMatchObject({
      season: 'spring',
      dayOfSeason: 1,
      weekday: 'Mon',
      year: 1,
    });
    expect(calendar(29)).toMatchObject({ season: 'summer', dayOfSeason: 1 });
    expect(calendar(113)).toMatchObject({ season: 'spring', year: 2 });
    expect(calendar(7).weekday).toBe('Sun');
  });
  it('formats the clock in English 12-hour time', () => {
    expect(formatClock(360)).toBe('6:00 AM');
    expect(formatClock(21 * 60 + 47)).toBe('9:40 PM');
    expect(formatClock(25 * 60)).toBe('1:00 AM');
  });
});

describe('world', () => {
  it('finds slots only on slot rows', () => {
    expect(slotAt(17, 31)?.field.id).toBe('garage');
    expect(slotAt(17, 32)).toBeUndefined();
    expect(slotAt(18, 33)).toMatchObject({ col: 1, row: 1 });
  });
});

describe('rigs', () => {
  const env = { weather: 'sunny' as const, season: 'spring' as const, powerOff: false };

  function running(id: number, x: number, y: number) {
    const r = newRig(id, x, y, 'frame_t1');
    r.cpuId = 'cpu_common';
    r.powered = true;
    return r;
  }

  it('applies neighbor heat and cooling units', () => {
    const a = running(1, 17, 31);
    const b = running(2, 18, 31);
    const alone = computeTemp(a, [a], [], env).total;
    const packed = computeTemp(a, [a, b], [], env).total;
    expect(packed - alone).toBe(4);
    const cooled = computeTemp(a, [a, b], [{ x: 17, y: 33, itemId: 'cooling_lv1' }], env).total;
    expect(packed - cooled).toBe(6);
  });

  it('boots, mines and becomes ready after its cycle', () => {
    const r = running(1, 17, 31);
    r.bootRemaining = 30;
    expect(rigStatus(r)).toBe('booting');
    simulateRigs([r], [], env, 30);
    expect(rigStatus(r)).toBe('mining');
    const events = simulateRigs([r], [], env, 2 * 24 * 60);
    expect(rigStatus(r)).toBe('ready');
    expect(events.some((e) => e.kind === 'ready')).toBe(true);
  });

  it('overheats in a heatwave when neglected and packed', () => {
    const rigs = [
      running(1, 18, 33),
      running(2, 17, 33),
      running(3, 19, 33),
      running(4, 18, 31),
      running(5, 18, 35),
    ];
    for (const r of rigs) {
      r.dust = 100;
      r.paste = 0;
    }
    const hot = { weather: 'heatwave' as const, season: 'summer' as const, powerOff: false };
    simulateRigs(rigs, [], hot, 10);
    expect(rigs[0]!.overheat).toBe(true);
    expect(rigStatus(rigs[0]!)).toBe('overheat');
  });

  it('respects frame rarity caps', () => {
    const r = newRig(1, 17, 31, 'frame_t1');
    expect(canInstall(r, requireItem('cpu_common')).ok).toBe(true);
    expect(canInstall(r, requireItem('cpu_rare')).ok).toBe(false);
  });

  it('computes power draw with PSU efficiency', () => {
    const r = running(1, 17, 31);
    expect(rigWatts(r)).toBe(80); // 60 * 1.25 + 5
    r.psuId = 'psu_rare';
    expect(rigWatts(r)).toBe(65);
    expect(powerCapacity(['wiring_1'])).toBe(750);
  });

  it('wears rigs overnight and drones maintain the data center', () => {
    const r = running(1, 17, 31);
    applyOvernightWear(r, 'sunny');
    expect(r.dust).toBe(12);
    expect(r.condition).toBe(98);
    const rain = running(2, 18, 31);
    applyOvernightWear(rain, 'rainy');
    expect(rain.dust).toBe(0);
    const dc = running(3, 72, 47);
    dc.dust = 50;
    applyOvernightWear(dc, 'sunny');
    expect(dc.dust).toBe(0);
  });
});

describe('economy', () => {
  it('converts USD to token units and back', () => {
    const units = usdToTokenUnits(0.08, 180, 18);
    expect(units).toBe(444444444444444n);
    expect(tokenUnitsToUsd(units, 180, 18)).toBeCloseTo(0.08, 5);
    expect(formatTokenUnits(10n ** 18n * 12480n, 18)).toBe('12,480');
    expect(formatTokenUnits(320000000000000000n, 18)).toBe('0.32');
  });

  it('refills energy by bedtime', () => {
    expect(energyAfterSleep(22 * 60)).toBe(100);
    expect(energyAfterSleep(24 * 60)).toBe(90);
    expect(energyAfterSleep(26 * 60)).toBe(60);
  });

  it('market prices are deterministic per day and fluctuate', () => {
    const a = marketQuote(DEFAULT_MARKET_CONFIG, 'cpu_common', 3, 'spring')!;
    const b = marketQuote(DEFAULT_MARKET_CONFIG, 'cpu_common', 3, 'spring')!;
    const c = marketQuote(DEFAULT_MARKET_CONFIG, 'cpu_common', 4, 'spring')!;
    expect(a).toEqual(b);
    expect(a.sell).toBeLessThan(a.buy);
    expect([a.buy, c.buy].length).toBe(2);
  });
});

describe('content', () => {
  it('has unique item ids', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });
  it('palette only has valid hex colors', () => {
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('generates daily quests deterministically', () => {
    expect(dailyQuestFor(1, 5)).toEqual(dailyQuestFor(1, 5));
  });
  it('validates farm names', () => {
    expect(validateFarmName('ab')).not.toBeNull();
    expect(validateFarmName("Ray's Garage")).toBeNull();
  });
});
