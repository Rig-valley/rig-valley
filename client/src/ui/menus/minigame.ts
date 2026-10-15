/**
 * Coffee Rush: Bo's odd job at the café. Make drinks by pressing the arrow keys in
 * order; orders made without a slip earn tips. Juicy on purpose: countdown, filling
 * cup, combo streak, popups, shake on mistakes and a star rating at the end.
 *
 * The server starts the shift and picks the orders (from a seed); the client sends back
 * every key press with its time, and the server replays the shift to work out the pay.
 */
import {
  COFFEE_RUSH_COUNTDOWN_MS,
  COFFEE_RUSH_SHIFT_MS,
  MINIGAMES,
  coffeeRushOrders,
  type RushKey,
  type RushPress,
} from '@rig-valley/shared';
import { store } from '../../store';
import { sfx } from '../../audio';
import { clear, h, portrait } from '../dom';
import { openModal } from '../modal';

/** Index = the key code the server uses (0 up, 1 down, 2 left, 3 right). */
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
type Arrow = (typeof ARROWS)[number];
const GLYPH: Record<Arrow, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const WASD: Record<string, Arrow> = {
  w: 'ArrowUp',
  s: 'ArrowDown',
  a: 'ArrowLeft',
  d: 'ArrowRight',
};
const DRINKS = [
  'Latte',
  'Espresso',
  'Mocha',
  'Cold Brew',
  'Overclock Frappé',
  'Chai',
  'Flat White',
  'Cortado',
];
const CUSTOMERS = ['Mina', 'Theo', 'Rosa', 'Pip', 'Juno', 'Ezra', 'Wren', 'Sol', 'Nico', 'Ivy'];
const DRINK_COLOR = ['#94504a', '#5a2e2b', '#6b3a2e', '#2a1a14', '#cf8556', '#b8763a', '#ffd685'];
const SHIFT_MS = COFFEE_RUSH_SHIFT_MS;

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

export function openCoffeeRush(): void {
  const game = MINIGAMES.coffee_rush;

  // ---------------------------------------------------------------- layout
  const bubble = h('div', { class: 'cr-bubble' }, 'Ready for the morning rush?');
  const bo = portrait('bo');
  bo.style.backgroundPosition = '-64px 0'; // portrait sheet at 64px per face
  const head = h('div', { class: 'cr-head' }, bo, bubble);
  const timeFill = h('div', { class: 'cr-time-fill' });
  const timeBar = h('div', { class: 'cr-time' }, timeFill);
  const ordersEl = h('span', { class: 'num' }, `0/${game.maxScore}`);
  const streakEl = h('span', { class: 'num' }, '0');
  const tipsEl = h('span', { class: 'num' }, '0');
  const stats = h(
    'div',
    { class: 'cr-stats' },
    h('div', null, h('small', null, 'Orders'), ordersEl),
    h('div', null, h('small', null, 'Perfect streak'), streakEl),
    h('div', null, h('small', null, 'Tips'), tipsEl),
  );
  const queue = h('div', { class: 'cr-queue', 'aria-hidden': 'true' });
  const drinkName = h('div', { class: 'cr-drink' });
  const fill = h('div', { class: 'cr-fill' });
  const steam = h('div', { class: 'cr-steam' }, h('i'), h('i'), h('i'));
  const cup = h('div', { class: 'cr-cup' }, fill, steam);
  const keys = h('div', { class: 'cr-keys', 'aria-live': 'polite' });
  const popLayer = h('div', { class: 'cr-pops', 'aria-hidden': 'true' });
  const stage = h(
    'div',
    { class: 'cr-stage' },
    queue,
    drinkName,
    cup,
    h('div', { class: 'cr-bar' }),
    popLayer,
  );
  const how = h(
    'p',
    { class: 'dim cr-how' },
    `Press the arrow keys (or WASD) in order to make each drink. ${game.maxScore} orders, 30 seconds. No slips on an order = a tip from Bo.`,
  );
  const tired = (store.state?.farm.energy ?? 0) < game.energy;
  const start = h(
    'button',
    { class: 'btn primary big', type: 'button', disabled: tired },
    `Start shift · ${game.energy} Energy`,
  );
  const later = h('button', { class: 'btn big', type: 'button' }, 'Not now');
  const footer = h('div', { class: 'row', style: 'justify-content:center;gap:12px' }, later, start);
  const panel = h(
    'div',
    { class: 'panel modal cr' },
    h('h2', null, 'Coffee Rush'),
    head,
    timeBar,
    stats,
    stage,
    keys,
    how,
    footer,
  );
  if (tired) {
    how.textContent = `A shift takes ${game.energy} Energy and you have ${store.state?.farm.energy ?? 0}. Eat something or sleep first.`;
    how.classList.add('bad');
  }
  const m = openModal(panel, { closable: false });
  later.addEventListener('click', () => m.close());

  // ---------------------------------------------------------------- state
  let score = 0;
  let perfect = 0;
  let streak = 0;
  let slipped = false;
  let seq: Arrow[] = [];
  let pos = 0;
  let deadline = 0;
  let goAt = 0;
  let timer = 0;
  let running = false;
  /** Between two orders: key presses are ignored (and not sent). */
  let between = false;
  let orders: RushKey[][] = [];
  const presses: RushPress[] = [];
  let color = DRINK_COLOR[0]!;
  const waiting: string[] = [];
  /** Next customer in line, never someone already waiting. */
  const nextCustomer = () => pick(CUSTOMERS.filter((c) => !waiting.includes(c)));
  for (let i = 0; i < 3; i++) waiting.push(nextCustomer());

  const say = (text: string) => {
    bubble.textContent = text;
    bubble.animate([{ transform: 'scale(0.92)' }, { transform: 'scale(1)' }], {
      duration: 160,
      easing: 'steps(3)',
    });
  };
  const pop = (text: string, cls = '') => {
    const el = h('div', { class: `cr-pop num ${cls}` }, text);
    el.style.left = `${46 + Math.random() * 8}%`;
    popLayer.append(el);
    el.animate(
      [
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 1 },
        { transform: 'translate(-50%, -30px) scale(1.2)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%, -80px) scale(1)', opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => el.remove();
  };
  const shake = () =>
    stage.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 220, easing: 'steps(5)' },
    );

  const renderQueue = () => {
    clear(queue);
    waiting.forEach((name, i) =>
      queue.append(h('div', { class: `cr-customer${i === 0 ? ' now' : ''}` }, h('b', null, name))),
    );
  };
  const renderKeys = () => {
    clear(keys);
    seq.forEach((k, i) =>
      keys.append(
        h('span', { class: `cr-key${i < pos ? ' hit' : i === pos ? ' next' : ''}` }, GLYPH[k]),
      ),
    );
    fill.style.height = `${(pos / Math.max(1, seq.length)) * 82}%`;
    fill.style.background = color;
  };
  const renderStats = () => {
    ordersEl.textContent = `${score}/${game.maxScore}`;
    streakEl.textContent = String(streak);
    tipsEl.textContent = String(perfect * game.tipPerPerfect);
  };
  const newOrder = () => {
    seq = (orders[score] ?? []).map((k) => ARROWS[k]!);
    between = false;
    pos = 0;
    slipped = false;
    color = pick(DRINK_COLOR);
    drinkName.textContent = `${waiting[0]} wants a ${pick(DRINKS)}`;
    cup.classList.remove('done');
    renderQueue();
    renderKeys();
  };

  const tickTime = () => {
    const left = Math.max(0, deadline - performance.now());
    timeFill.style.width = `${(left / SHIFT_MS) * 100}%`;
    timeBar.classList.toggle('low', left < 6000);
    if (left <= 0) void finish();
  };

  const finish = async () => {
    if (!running) return;
    running = false;
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey, true);
    tickTime();
    const pay = score * game.coinsPerPoint;
    const tips = perfect * game.tipPerPerfect;
    const stars = score >= 9 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
    say(
      stars === 3
        ? "You're a natural! Same time tomorrow?"
        : stars === 2
          ? 'Not bad at all! The regulars liked you.'
          : stars === 1
            ? 'Phew. We survived the rush.'
            : 'Well... the customers were patient.',
    );
    clear(stage);
    keys.remove();
    stage.classList.add('result');
    panel.classList.add('done');
    const starRow = h('div', { class: 'cr-stars' });
    for (let i = 0; i < 3; i++) starRow.append(h('span', { class: i < stars ? 'on' : '' }, '★'));
    stage.append(
      h(
        'div',
        { class: 'cr-result' },
        starRow,
        h(
          'div',
          { class: 'cr-bill' },
          h('span', null, `Drinks ${score} × ${game.coinsPerPoint}`),
          h('b', { class: 'num' }, String(pay)),
          h('span', null, `Perfect orders ${perfect} × ${game.tipPerPerfect} (tips)`),
          h('b', { class: 'num' }, String(tips)),
          h('span', { class: 'total' }, 'Total'),
          h('b', { class: 'num total' }, `${pay + tips} Coins`),
        ),
      ),
    );
    [...starRow.children].forEach((el, i) =>
      (el as HTMLElement).animate(
        [{ transform: 'scale(0)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }],
        { duration: 360, delay: 200 + i * 220, easing: 'steps(6)', fill: 'backwards' },
      ),
    );
    if (stars) sfx('quest');
    const done = h(
      'button',
      { class: 'btn primary big', type: 'button' },
      pay + tips > 0 ? 'Collect pay' : 'Finish shift',
    );
    clear(footer);
    footer.append(done);
    done.addEventListener('click', async () => {
      done.setAttribute('disabled', '');
      const box = done.getBoundingClientRect();
      const ok = await store.act({ type: 'minigame', game: 'coffee_rush', presses });
      if (!ok) {
        // The server said no (the error toast explains why): let the player retry or leave.
        done.removeAttribute('disabled');
        done.textContent = 'Try again';
        if (!footer.contains(leave)) footer.prepend(leave);
        return;
      }
      if (pay + tips > 0)
        store.emit('coinBurst', {
          fx: (box.left + box.width / 2) / window.innerWidth,
          fy: box.top / window.innerHeight,
          label: `+${pay + tips}`,
          count: Math.min(10, 3 + stars * 2),
        });
      m.close();
    });
    const leave = h('button', { class: 'btn big', type: 'button' }, 'Leave');
    leave.addEventListener('click', () => m.close());
    done.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!running) return;
    const key = (ARROWS as readonly string[]).includes(e.key)
      ? (e.key as Arrow)
      : WASD[e.key.toLowerCase()];
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || between) return;
    const at = Math.round(performance.now() - goAt);
    if (at > SHIFT_MS) return void finish();
    presses.push([ARROWS.indexOf(key) as RushKey, at]);
    if (key === seq[pos]) {
      pos++;
      sfx('blip');
      renderKeys();
      if (pos < seq.length) return;
      // Order up!
      score++;
      cup.classList.add('done');
      pop(`+${game.coinsPerPoint}`);
      if (!slipped) {
        perfect++;
        streak++;
        pop(`+${game.tipPerPerfect} tip`, 'tip');
        if (streak >= 3) say(`${streak} perfect in a row! The line loves you.`);
      } else say(pick(['Order up!', 'Nice one!', 'Next!', 'Coming right up!']));
      sfx('coin');
      renderStats();
      waiting.shift();
      waiting.push(nextCustomer());
      if (score >= game.maxScore) return void finish();
      between = true;
      window.setTimeout(() => running && newOrder(), 140);
    } else {
      sfx('error');
      slipped = true;
      streak = 0;
      pos = 0;
      shake();
      say(pick(['Oops — start that one over!', 'Wrong syrup!', 'Careful, careful!']));
      renderKeys();
      renderStats();
    }
  };

  start.addEventListener('click', async () => {
    start.setAttribute('disabled', '');
    later.setAttribute('disabled', '');
    // Bo opens the shift on the server: it uses the Energy and picks today's orders.
    const ok = await store.act({ type: 'minigame_start', game: 'coffee_rush' });
    const rush = store.state?.farm.daily.coffeeRush;
    if (!ok || !rush) {
      m.close();
      return;
    }
    orders = coffeeRushOrders(rush.seed);
    later.remove();
    how.remove();
    renderQueue();
    drinkName.textContent = 'Get ready…';
    // 3, 2, 1, go!
    const counts = ['3', '2', '1', 'Go!'];
    const step = COFFEE_RUSH_COUNTDOWN_MS / (counts.length - 1);
    counts.forEach((c, i) =>
      window.setTimeout(() => {
        clear(keys);
        keys.append(h('span', { class: 'cr-count' }, c));
        sfx(i === counts.length - 1 ? 'power_on' : 'blip');
        if (i === counts.length - 1) {
          clear(footer);
          running = true;
          goAt = performance.now();
          deadline = goAt + SHIFT_MS;
          window.addEventListener('keydown', onKey, true);
          timer = window.setInterval(tickTime, 100);
          say('Order up! Go go go!');
          newOrder();
          renderStats();
        }
      }, i * step),
    );
  });
}
