/**
 * In-game time (MASTERPLAN §6).
 *
 * Time is tracked as `day` (1-based absolute day number) and `minute`
 * (minutes since midnight of that day). The day runs 6:00 AM (360) to
 * 2:00 AM the next morning (1560). 10 in-game minutes ≈ 7 real seconds.
 */
export const DAY_START_MINUTE = 6 * 60; // 6:00 AM
export const MIDNIGHT_MINUTE = 24 * 60; // 12:00 AM
export const DAY_END_MINUTE = 26 * 60; // 2:00 AM (next calendar day)
export const MINUTES_PER_DAY = 24 * 60;
export const REAL_MS_PER_GAME_MINUTE = 700;

/** Longest real-time gap a single tick may cover. Longer gaps = player was away = world frozen. */
export const MAX_TICK_GAP_MS = 10_000;
/** How often the client should send a tick while playing. */
export const TICK_INTERVAL_MS = 4_000;

export const DAYS_PER_SEASON = 28;
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_NAMES: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface CalendarInfo {
  day: number;
  year: number;
  season: Season;
  /** 1..28 */
  dayOfSeason: number;
  weekday: Weekday;
  /** 0 = Monday */
  weekdayIndex: number;
}

export function calendar(day: number): CalendarInfo {
  const d = Math.max(1, Math.floor(day)) - 1;
  const seasonIndex = Math.floor(d / DAYS_PER_SEASON) % SEASONS.length;
  const year = Math.floor(d / (DAYS_PER_SEASON * SEASONS.length)) + 1;
  const weekdayIndex = d % 7;
  return {
    day: d + 1,
    year,
    season: SEASONS[seasonIndex]!,
    dayOfSeason: (d % DAYS_PER_SEASON) + 1,
    weekday: WEEKDAYS[weekdayIndex]!,
    weekdayIndex,
  };
}

/** Format a game minute (may exceed 1440) as a 12-hour English clock, e.g. "9:40 PM". */
export function formatClock(minute: number): string {
  const m = Math.floor(minute) % MINUTES_PER_DAY;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  // Display in 10-minute steps like classic farming games.
  const shown = Math.floor(mm / 10) * 10;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${shown.toString().padStart(2, '0')} ${suffix}`;
}

/** 0 at noon, 1 deep night. Used for lighting. */
export function nightFactor(minute: number): number {
  const m = minute % MINUTES_PER_DAY;
  const h = m / 60;
  if (h >= 7 && h < 17) return 0.15;
  if (h >= 17 && h < 21) return 0.15 + ((h - 17) / 4) * 0.85;
  if (h >= 21 || h < 5) return 1;
  // 5..7 dawn
  return 1 - ((h - 5) / 2) * 0.85;
}

export function gameMinutesFromRealMs(ms: number): number {
  return ms / REAL_MS_PER_GAME_MINUTE;
}
