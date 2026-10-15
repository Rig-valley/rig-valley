/** "How to play" card: shown once on the first visit, and from Settings anytime. */
import { h } from '../dom';
import { openModal } from '../modal';

const SEEN_KEY = 'rv.howToPlaySeen';

function keys(...k: string[]): HTMLElement {
  return h('div', { class: 'keys' }, ...k.map((x) => h('span', { class: 'key' }, x)));
}

export function openHowToPlay(): Promise<void> {
  return new Promise((resolve) => {
    const ok = h('button', { class: 'btn primary big', type: 'button' }, "Got it — let's farm!");
    const panel = h(
      'div',
      { class: 'panel modal' },
      h('h2', null, 'How to play'),
      h(
        'div',
        { class: 'controls-grid' },
        keys('W', 'A', 'S', 'D'),
        h('span', null, 'Walk around (arrow keys work too)'),
        keys('E'),
        h(
          'span',
          null,
          'Use whatever is next to you — doors, rigs, people, the mailbox (Space works too)',
        ),
        keys('I'),
        h('span', null, 'Your bag'),
        keys('J'),
        h('span', null, 'Journal: your quests'),
        keys('M'),
        h('span', null, 'Mailbox'),
        keys('F'),
        h('span', null, 'Friends: who likes what, and what they unlock'),
        keys('R'),
        h('span', null, 'Rewards & Withdraw'),
        keys('Esc'),
        h('span', null, 'Close menus / Settings'),
      ),
      h(
        'div',
        { class: 'panel', style: 'border-top-color:var(--yellow)' },
        h(
          'p',
          null,
          'Follow the ',
          h('b', { style: 'color:var(--yellow)' }, 'yellow arrow'),
          ' and the ',
          h('b', { style: 'color:var(--yellow)' }, 'Tutorial / Objective'),
          ' box at the top right. It always tells you what to do next and where to go.',
        ),
      ),
      h(
        'p',
        null,
        'Spot a ',
        h('b', { style: 'color:var(--yellow)' }, 'twinkling glint'),
        '? Walk over and press E — shiny scraps hide Coins, snacks and the odd rare find. New ones appear every day.',
      ),
      h(
        'p',
        { class: 'dim' },
        'Time stops while a menu is open, and the world waits while you are away. Bed opens at 8:00 PM (from 2:00 PM if you are worn out); rigs keep working all day.',
      ),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, ok),
    );
    const m = openModal(panel, { onClose: () => resolve(), key: 'howto' });
    ok.addEventListener('click', () => m.close());
    queueMicrotask(() => ok.focus());
  });
}

/** Show once per device. */
export async function maybeShowHowToPlay(): Promise<void> {
  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === '1';
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable: show it */
  }
  if (!seen) await openHowToPlay();
}
