/** 16×16 item and UI icons (shown at 2× in the UI). Index = Item.icon. */
import { RAMPS } from '@rig-valley/shared';
import { Canvas } from './canvas.js';
import { buildDecorSheet } from './props.js';

const N = RAMPS.night;
const M = RAMPS.metal;
const WD = RAMPS.wood;
const WA = RAMPS.warm;
const CY = RAMPS.cyan;
const MG = RAMPS.magenta;
const GR = RAMPS.green;
const YE = RAMPS.yellow;
const RD = RAMPS.red;
const CO = RAMPS.coin;
const W = RAMPS.water;
const G = RAMPS.grass;
const S = RAMPS.stone;
const OUT = N[0];

export const ICON = {
  screwdriver: 0,
  fan: 1,
  psu: 2,
  cloth: 3,
  cpu: 4,
  paste: 5,
  coin: 6,
  clock: 7,
  frame: 8,
  cooling: 9,
  catbed: 10,
  shield: 11,
  coffee: 12,
  sandwich: 13,
  soda: 14,
  cookie: 15,
  flowers: 16,
  hotsauce: 17,
  solder: 18,
  battery: 19,
  luckycat: 20,
  gpu: 21,
  paint: 30,
  hat: 31,
  energy: 32,
  mail: 33,
  nvda: 34,
  plug: 35,
  temp: 36,
  heart: 37,
  quest: 38,
  wallet: 39,
  sunny: 40,
  rainy: 41,
  heatwave: 42,
  storm: 43,
  snow: 44,
  speed: 45,
  health: 46,
  dust: 47,
} as const;

export const ICON_COUNT = 48;

export function buildIcons(): Canvas {
  const cols = 16;
  const sheet = new Canvas(cols * 16, Math.ceil(ICON_COUNT / cols) * 16);
  const draw: Record<number, (c: Canvas) => void> = {
    [ICON.screwdriver]: (c) => {
      c.line(3, 12, 9, 6, M[3]);
      c.line(4, 12, 10, 6, M[2]);
      c.rect(9, 2, 4, 6, CY[0]);
      c.rect(10, 2, 3, 5, CY[1]);
      c.px(2, 13, M[4]);
    },
    [ICON.fan]: (c) => {
      c.rect(2, 2, 12, 12, M[1]);
      c.circle(8, 8, 5, N[1]);
      for (const [x, y] of [
        [5, 5],
        [11, 11],
        [11, 5],
        [5, 11],
        [6, 6],
        [10, 10],
        [10, 6],
        [6, 10],
      ])
        c.px(x!, y!, CY[1]);
      c.px(8, 8, CY[0]);
      c.hline(2, 2, 12, M[3]);
    },
    [ICON.psu]: (c) => {
      c.rect(2, 4, 12, 9, M[1]);
      c.hline(2, 4, 12, M[3]);
      c.circle(6, 8, 2, N[1]);
      c.rect(10, 7, 3, 3, YE[1]);
      c.line(13, 11, 15, 14, N[3]);
    },
    [ICON.cloth]: (c) => {
      c.rect(3, 4, 10, 9, CY[0]);
      c.line(3, 4, 12, 12, CY[1]);
      c.rect(3, 11, 10, 2, W[2]);
      c.px(13, 3, WA[2]);
      c.px(14, 2, WA[2]);
    },
    [ICON.cpu]: (c) => {
      c.rect(3, 3, 10, 10, GR[0]);
      c.rect(5, 5, 6, 6, M[3]);
      c.rect(6, 6, 4, 4, M[2]);
      for (let i = 4; i < 12; i += 2) {
        c.px(i, 2, CO[2]);
        c.px(i, 13, CO[2]);
        c.px(2, i, CO[2]);
        c.px(13, i, CO[2]);
      }
    },
    [ICON.paste]: (c) => {
      c.rect(4, 3, 7, 10, M[3]);
      c.vline(4, 3, 10, M[4]);
      c.rect(5, 6, 5, 4, CY[0]);
      c.rect(6, 13, 3, 2, M[2]);
      c.rect(11, 2, 2, 2, M[4]);
    },
    [ICON.coin]: (c) => {
      c.circle(8, 8, 6, CO[2]);
      c.circle(8, 8, 4, CO[1]);
      c.vline(8, 5, 7, CO[3]);
      c.px(5, 4, CO[3]);
    },
    [ICON.clock]: (c) => {
      c.circle(8, 8, 6, WA[1]);
      c.circle(8, 8, 5, N[1]);
      c.vline(8, 4, 5, WA[2]);
      c.hline(8, 8, 3, WA[2]);
    },
    [ICON.frame]: (c) => {
      c.box(4, 2, 8, 12, M[3]);
      c.hline(4, 2, 8, M[4]);
      c.hline(4, 8, 8, M[2]);
      c.rect(3, 13, 10, 2, M[1]);
    },
    [ICON.cooling]: (c) => {
      c.rect(3, 5, 10, 9, M[2]);
      c.hline(3, 5, 10, M[4]);
      c.circle(8, 8, 2, N[1]);
      c.px(8, 8, CY[1]);
      c.px(7, 7, CY[1]);
      c.px(9, 9, CY[1]);
      c.hline(4, 12, 8, M[1]);
      c.px(11, 12, CY[1]);
    },
    [ICON.catbed]: (c) => {
      c.ellipse(8, 10, 6, 4, MG[0]);
      c.ellipse(8, 9, 4, 2, WA[0]);
      c.circle(6, 8, 2, WD[3]);
      c.px(5, 6, WD[3]);
      c.px(7, 6, WD[3]);
    },
    [ICON.shield]: (c) => {
      c.rect(4, 3, 8, 7, CY[0]);
      for (let j = 0; j < 4; j++) c.hline(4 + j, 10 + j, 8 - j * 2, CY[0]);
      c.line(9, 4, 7, 8, YE[1]);
      c.line(7, 8, 9, 8, YE[1]);
      c.line(9, 8, 7, 12, YE[1]);
    },
    [ICON.coffee]: (c) => {
      c.rect(3, 6, 8, 8, WA[2]);
      c.rect(4, 6, 6, 2, WD[1]);
      c.box(11, 8, 3, 4, WA[2]);
      c.px(5, 3, M[3]);
      c.px(7, 2, M[3]);
      c.px(6, 4, M[3]);
    },
    [ICON.sandwich]: (c) => {
      c.rect(2, 5, 12, 3, WA[1]);
      c.rect(2, 8, 12, 2, GR[0]);
      c.rect(2, 10, 12, 1, RD[0]);
      c.rect(2, 11, 12, 3, WA[1]);
      c.hline(2, 5, 12, WA[2]);
    },
    [ICON.soda]: (c) => {
      c.rect(5, 3, 6, 11, MG[0]);
      c.vline(5, 3, 11, MG[1]);
      c.rect(5, 6, 6, 4, CY[1]);
      c.hline(6, 2, 4, M[3]);
    },
    [ICON.cookie]: (c) => {
      c.rect(3, 3, 10, 10, WD[3]);
      c.box(3, 3, 10, 10, WD[2]);
      for (const [x, y] of [
        [5, 5],
        [9, 6],
        [6, 9],
        [10, 10],
      ])
        c.px(x!, y!, WD[0]);
      c.hline(4, 7, 8, WD[2]);
    },
    [ICON.flowers]: (c) => {
      c.line(8, 14, 8, 7, G[3]);
      c.line(8, 14, 4, 8, G[3]);
      c.line(8, 14, 12, 8, G[3]);
      c.circle(8, 5, 2, MG[1]);
      c.circle(4, 7, 1, CY[1]);
      c.circle(12, 7, 1, YE[1]);
    },
    [ICON.hotsauce]: (c) => {
      c.rect(5, 6, 6, 8, RD[0]);
      c.vline(5, 6, 8, RD[1]);
      c.rect(7, 2, 2, 4, WA[2]);
      c.rect(6, 9, 4, 3, WA[1]);
    },
    [ICON.solder]: (c) => {
      c.rect(2, 9, 12, 5, M[1]);
      c.hline(2, 9, 12, M[3]);
      c.line(4, 8, 12, 2, M[4]);
      c.px(12, 2, WA[0]);
      c.rect(9, 11, 3, 2, YE[1]);
    },
    [ICON.battery]: (c) => {
      c.rect(3, 5, 9, 7, GR[0]);
      c.box(3, 5, 9, 7, M[3]);
      c.rect(12, 7, 2, 3, M[3]);
      c.rect(4, 6, 5, 5, GR[1]);
    },
    [ICON.luckycat]: (c) => {
      c.rect(4, 6, 8, 8, WA[2]);
      c.px(4, 5, WA[2]);
      c.px(11, 5, WA[2]);
      c.px(6, 8, N[0]);
      c.px(9, 8, N[0]);
      c.rect(12, 3, 2, 5, WA[2]);
      c.px(7, 10, RD[1]);
      c.circle(8, 12, 1, CO[2]);
    },
    [ICON.gpu]: (c) => {
      c.rect(1, 5, 14, 7, N[3]);
      c.hline(1, 5, 14, N[4]);
      c.circle(5, 8, 2, M[1]);
      c.circle(11, 8, 2, M[1]);
      c.hline(2, 12, 10, CO[2]);
    },
    [ICON.paint]: (c) => {
      c.rect(4, 5, 8, 9, M[3]);
      c.rect(4, 5, 8, 3, MG[1]);
      c.line(5, 9, 5, 12, MG[1]);
      c.box(5, 2, 6, 3, M[2]);
    },
    [ICON.hat]: (c) => {
      c.rect(4, 6, 8, 5, CY[0]);
      c.hline(4, 6, 8, CY[1]);
      c.hline(2, 11, 12, N[3]);
      c.hline(6, 4, 4, M[4]);
    },
    [ICON.energy]: (c) => {
      c.line(10, 1, 4, 9, YE[1]);
      c.line(11, 1, 5, 9, YE[1]);
      c.hline(4, 9, 7, YE[1]);
      c.line(10, 9, 6, 15, YE[1]);
      c.line(11, 9, 7, 15, YE[0]);
    },
    [ICON.mail]: (c) => {
      c.rect(2, 4, 12, 9, WA[2]);
      c.line(2, 4, 8, 9, WA[0]);
      c.line(13, 4, 8, 9, WA[0]);
      c.px(12, 5, RD[1]);
    },
    [ICON.nvda]: (c) => {
      c.circle(8, 8, 6, GR[0]);
      c.circle(8, 8, 5, GR[1]);
      c.line(5, 11, 5, 6, N[0]);
      c.line(5, 6, 10, 11, N[0]);
      c.line(10, 11, 10, 5, N[0]);
    },
    [ICON.plug]: (c) => {
      c.rect(4, 6, 8, 6, M[3]);
      c.vline(6, 3, 3, M[4]);
      c.vline(9, 3, 3, M[4]);
      c.line(8, 12, 8, 15, N[3]);
    },
    [ICON.temp]: (c) => {
      c.rect(7, 2, 3, 9, M[4]);
      c.vline(8, 5, 7, RD[1]);
      c.circle(8, 12, 2, RD[1]);
    },
    [ICON.heart]: (c) => {
      c.circle(5, 6, 3, MG[1]);
      c.circle(11, 6, 3, MG[1]);
      for (let j = 0; j < 6; j++) c.hline(2 + j, 8 + j, 13 - j * 2, MG[1]);
      c.px(5, 5, WA[2]);
    },
    [ICON.quest]: (c) => {
      c.rect(3, 3, 10, 11, WA[2]);
      c.hline(3, 3, 10, WA[1]);
      for (let j = 6; j < 13; j += 2) c.hline(5, j, 6, WD[1]);
      c.circle(12, 12, 2, RD[0]);
    },
    [ICON.wallet]: (c) => {
      c.rect(2, 4, 12, 9, W[2]);
      c.hline(2, 4, 12, W[3]);
      c.rect(10, 7, 4, 3, N[2]);
      c.px(11, 8, CY[1]);
    },
    [ICON.sunny]: (c) => {
      c.circle(8, 8, 3, WA[1]);
      for (const [x, y] of [
        [8, 2],
        [8, 14],
        [2, 8],
        [14, 8],
        [4, 4],
        [12, 12],
        [4, 12],
        [12, 4],
      ])
        c.px(x!, y!, WA[0]);
    },
    [ICON.rainy]: (c) => {
      c.circle(6, 6, 3, M[3]);
      c.circle(10, 6, 3, M[3]);
      c.hline(4, 9, 9, M[3]);
      for (const x of [5, 8, 11]) c.vline(x, 11, 3, W[3]);
    },
    [ICON.heatwave]: (c) => {
      c.circle(8, 6, 3, RD[1]);
      for (let i = 0; i < 3; i++)
        for (let x = 2; x < 14; x++)
          if ((x + i) % 4 < 2) c.px(x, 11 + i * 2 - ((x + i) % 2), WA[0]);
    },
    [ICON.storm]: (c) => {
      c.circle(6, 5, 3, N[3]);
      c.circle(10, 5, 3, N[3]);
      c.hline(4, 8, 9, N[3]);
      c.line(9, 9, 7, 12, YE[1]);
      c.line(7, 12, 9, 12, YE[1]);
      c.line(9, 12, 7, 15, YE[1]);
    },
    [ICON.snow]: (c) => {
      c.line(8, 2, 8, 14, M[4]);
      c.line(3, 5, 13, 11, M[4]);
      c.line(3, 11, 13, 5, M[4]);
      c.px(8, 8, CY[1]);
    },
    [ICON.speed]: (c) => {
      c.line(2, 12, 7, 7, CY[1]);
      c.line(7, 7, 10, 10, CY[1]);
      c.line(10, 10, 14, 4, CY[1]);
      c.hline(11, 4, 3, CY[1]);
      c.vline(14, 4, 3, CY[1]);
    },
    [ICON.health]: (c) => {
      c.rect(6, 3, 4, 10, GR[1]);
      c.rect(3, 6, 10, 4, GR[1]);
    },
    [ICON.dust]: (c) => {
      for (const [x, y] of [
        [4, 5],
        [9, 3],
        [12, 8],
        [6, 10],
        [10, 12],
        [3, 13],
      ])
        c.circle(x!, y!, 1, S[3]);
    },
  };
  const decor = buildDecorSheet();
  for (let i = 0; i < ICON_COUNT; i++) {
    const c = new Canvas(16, 16);
    if (draw[i]) draw[i]!(c);
    else if (i >= 22 && i <= 29) c.blit(decor, 0, 0, (i - 22) * 16, 6, 16, 16);
    else continue;
    if (!(i >= 22 && i <= 29)) c.outline(OUT);
    sheet.blit(c, (i % cols) * 16, Math.floor(i / cols) * 16);
  }
  return sheet;
}
