/**
 * Synthesized audio (no asset files): UI blips, harvest chimes, footsteps,
 * a soft rig hum that follows nearby running rigs, and a gentle generative tune.
 */
type SfxId =
  | 'open'
  | 'close'
  | 'blip'
  | 'step'
  | 'coin'
  | 'harvest'
  | 'error'
  | 'power_on'
  | 'power_off'
  | 'clean'
  | 'build'
  | 'sleep'
  | 'levelup'
  | 'quest'
  | 'overheat'
  | 'door'
  | 'mail';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let humGain: GainNode | null = null;
let musicTimer: number | null = null;

const SETTINGS_KEY = 'rv.audio';
interface AudioSettings {
  sfx: number;
  music: number;
  hum: number;
}
let settings: AudioSettings = { sfx: 0.6, music: 0.35, hum: 0.5 };
try {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) settings = { ...settings, ...(JSON.parse(raw) as Partial<AudioSettings>) };
} catch {
  /* storage unavailable */
}

export function audioSettings(): AudioSettings {
  return { ...settings };
}

export function setAudioSettings(s: Partial<AudioSettings>): void {
  settings = { ...settings, ...s };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  if (sfxGain) sfxGain.gain.value = settings.sfx;
  if (musicGain) musicGain.gain.value = settings.music * 0.5;
  if (humGain && settings.hum === 0) humGain.gain.value = 0;
}

/** Must be called from a user gesture (browser autoplay rules). */
export function unlockAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = settings.sfx;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = settings.music * 0.5;
  musicGain.connect(master);
  setupHum();
  startMusic();
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.15,
  when = 0,
  slideTo?: number,
): void {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.1, filter = 2000, when = 0): void {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime + when;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t);
}

export function sfx(id: SfxId): void {
  if (!ctx || settings.sfx <= 0) return;
  switch (id) {
    case 'open':
      tone(660, 0.06, 'square', 0.06);
      tone(990, 0.06, 'square', 0.05, 0.05);
      break;
    case 'close':
      tone(880, 0.05, 'square', 0.05);
      tone(560, 0.06, 'square', 0.04, 0.04);
      break;
    case 'blip':
      tone(1200, 0.04, 'square', 0.05);
      break;
    case 'step':
      noise(0.03, 0.035, 900);
      break;
    case 'coin':
      tone(988, 0.08, 'square', 0.08);
      tone(1319, 0.18, 'square', 0.08, 0.07);
      break;
    case 'harvest':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.07, i * 0.07));
      tone(1568, 0.3, 'triangle', 0.06, 0.3);
      break;
    case 'error':
      tone(180, 0.15, 'sawtooth', 0.07);
      tone(140, 0.2, 'sawtooth', 0.06, 0.08);
      break;
    case 'power_on':
      tone(220, 0.35, 'square', 0.05, 0, 880);
      break;
    case 'power_off':
      tone(660, 0.3, 'square', 0.05, 0, 110);
      break;
    case 'clean':
      noise(0.18, 0.08, 4000);
      noise(0.14, 0.06, 5000, 0.15);
      break;
    case 'build':
      [0, 0.1, 0.2].forEach((w) => noise(0.05, 0.12, 1200, w));
      tone(330, 0.1, 'square', 0.05, 0.3);
      break;
    case 'sleep':
      [784, 659, 523, 392].forEach((f, i) => tone(f, 0.4, 'triangle', 0.07, i * 0.22));
      break;
    case 'levelup':
      [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.08));
      break;
    case 'quest':
      [659, 880, 1175].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, i * 0.1));
      break;
    case 'overheat':
      tone(880, 0.12, 'sawtooth', 0.05);
      tone(880, 0.12, 'sawtooth', 0.05, 0.2);
      break;
    case 'door':
      noise(0.2, 0.08, 600);
      break;
    case 'mail':
      tone(1046, 0.08, 'triangle', 0.07);
      tone(1318, 0.12, 'triangle', 0.07, 0.09);
      break;
  }
}

// ------------------------------------------------------------------ rig hum
let humOsc: OscillatorNode | null = null;
function setupHum(): void {
  if (!ctx || !master) return;
  humGain = ctx.createGain();
  humGain.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  humGain.connect(master);
  lp.connect(humGain);
  humOsc = ctx.createOscillator();
  humOsc.type = 'sawtooth';
  humOsc.frequency.value = 55;
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = 110.6;
  const g2 = ctx.createGain();
  g2.gain.value = 0.4;
  humOsc.connect(lp);
  o2.connect(g2).connect(lp);
  // fan whoosh
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const n = ctx.createBufferSource();
  n.buffer = buf;
  n.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.6;
  const ng = ctx.createGain();
  ng.gain.value = 0.25;
  n.connect(bp).connect(ng).connect(humGain);
  humOsc.start();
  o2.start();
  n.start();
}

/** 0..1 intensity from nearby running rigs. */
export function setHum(intensity: number): void {
  if (!ctx || !humGain) return;
  const target = Math.min(1, intensity) * 0.05 * settings.hum;
  humGain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
}

// ------------------------------------------------------------------ music
const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
  [52, 55, 59],
];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function startMusic(): void {
  if (!ctx || !musicGain || musicTimer) return;
  let step = 0;
  const beat = 60 / 76 / 2; // eighth notes at 76 bpm
  let next = ctx.currentTime + 0.1;
  const schedule = () => {
    if (!ctx || !musicGain) return;
    while (next < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 16) % CHORDS.length;
      const chord = CHORDS[bar]!;
      if (step % 16 === 0) {
        for (const n of chord) pad(midi(n), beat * 16, next);
        pad(midi(chord[0]! - 12), beat * 16, next, 0.05);
      }
      const r = Math.sin(step * 12.9898) * 43758.5453;
      const rnd = r - Math.floor(r);
      if (step % 2 === 0 && rnd < 0.55) {
        const deg = SCALE[Math.floor(rnd * 10) % SCALE.length]!;
        const oct = rnd < 0.2 ? 12 : 0;
        pluck(midi(69 + deg + oct), beat * 1.5, next);
      }
      next += beat;
      step++;
    }
  };
  musicTimer = window.setInterval(schedule, 100);
}

function pad(freq: number, dur: number, t: number, vol = 0.035): void {
  if (!ctx || !musicGain) return;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.2);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function pluck(freq: number, dur: number, t: number): void {
  if (!ctx || !musicGain) return;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(400, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.045, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}
