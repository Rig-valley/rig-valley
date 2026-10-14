/**
 * The locked Rig Valley palette (MASTERPLAN §3). Art must only use these colors.
 * Every color lives on a dark → light ramp. Shading = one step along the ramp.
 */
export const RAMPS = {
  night: ['#0b0a1a', '#141331', '#1e1d4a', '#2a2b63', '#3d438a'],
  grass: ['#0c2429', '#123a3b', '#1b5249', '#2a7058', '#45966c', '#7cc48a'],
  soil: ['#1f1424', '#33202f', '#4d2c3e', '#6e4049'],
  wood: ['#33192a', '#5c2f36', '#94504a', '#cf8556'],
  warm: ['#ffae57', '#ffd685', '#fff3c9'],
  stone: ['#18162f', '#25234a', '#373665', '#514f85', '#7a7aac'],
  metal: ['#24253f', '#3b3e62', '#5d628e', '#8e94bf', '#cdd2ef'],
  water: ['#0d1840', '#14275c', '#1f3d80', '#3d6fb8'],
  cyan: ['#1593b8', '#3ff2ff'],
  magenta: ['#a82599', '#ff52dc'],
  green: ['#1fae6d', '#5cffab'],
  yellow: ['#b88a1c', '#ffe347'],
  red: ['#a3203a', '#ff4558'],
  coin: ['#8a4416', '#e0912a', '#ffd447', '#fff6c4'],
} as const;

export type RampName = keyof typeof RAMPS;

/** Flat list of all palette colors. */
export const PALETTE: readonly string[] = Object.values(RAMPS).flat();

/** Named UI tokens used by the DOM overlay and admin panel. */
export const UI = {
  outline: '#0b0a1a',
  panel: '#141331',
  panelBorder: '#3d438a',
  panelEdge: '#3ff2ff',
  text: '#cdd2ef',
  textDim: '#8e94bf',
  accent: '#3ff2ff',
  accent2: '#ff52dc',
  good: '#5cffab',
  warn: '#ffe347',
  bad: '#ff4558',
  gold: '#ffd447',
  warmLight: '#ffd685',
} as const;

/** Neon = status (MASTERPLAN §3). */
export const STATUS_NEON = {
  active: '#3ff2ff',
  activeAlt: '#ff52dc',
  healthy: '#5cffab',
  booting: '#ffe347',
  overheat: '#ff4558',
} as const;
