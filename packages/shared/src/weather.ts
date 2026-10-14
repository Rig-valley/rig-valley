import { pickWeighted } from './rng.js';
import type { Season } from './time.js';

/** Daily weather (MASTERPLAN §12). */
export const WEATHERS = ['sunny', 'rainy', 'heatwave', 'storm', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];

export const WEATHER_INFO: Record<
  Weather,
  { name: string; temp: number; dust: boolean; outageChance: number; forecast: string }
> = {
  sunny: {
    name: 'Sunny',
    temp: 0,
    dust: true,
    outageChance: 0,
    forecast: 'Sunny tomorrow. A normal, happy day.',
  },
  rainy: {
    name: 'Rainy',
    temp: -3,
    dust: false,
    outageChance: 0,
    forecast: 'Rain tomorrow. No dust will settle on your rigs.',
  },
  heatwave: {
    name: 'Heatwave',
    temp: 12,
    dust: true,
    outageChance: 0,
    forecast: 'Heatwave tomorrow. Prepare your cooling.',
  },
  storm: {
    name: 'Storm',
    temp: -2,
    dust: true,
    outageChance: 0.4,
    forecast: 'Storm tomorrow. The power might go out tonight.',
  },
  snow: {
    name: 'Snow',
    temp: -8,
    dust: true,
    outageChance: 0.15,
    forecast: 'Snow tomorrow. Rigs will run cooler, Power gets shaky.',
  },
};

export const SEASON_WEATHER: Record<Season, Partial<Record<Weather, number>>> = {
  spring: { sunny: 0.55, rainy: 0.35, storm: 0.1 },
  summer: { sunny: 0.5, heatwave: 0.3, rainy: 0.1, storm: 0.1 },
  fall: { sunny: 0.6, rainy: 0.3, storm: 0.1 },
  winter: { snow: 0.45, sunny: 0.35, storm: 0.2 },
};

/** Season temperature offset (°C). */
export const SEASON_TEMP: Record<Season, number> = {
  spring: 0,
  summer: 4,
  fall: 0,
  winter: -5,
};

export function rollWeather(season: Season, r: number): Weather {
  return pickWeighted(SEASON_WEATHER[season], r);
}
