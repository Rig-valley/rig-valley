/** Minimal DOM helpers for the UI overlay. */
import { formatInt, getItem } from '@rig-valley/shared';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'on') {
        for (const [ev, fn] of Object.entries(v as Record<string, EventListener>))
          el.addEventListener(ev, fn);
      } else if (k in el && typeof v !== 'string') {
        (el as unknown as Record<string, unknown>)[k] = v;
      } else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else
      el.appendChild(
        typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c,
      );
  }
}

/** Append children, skipping null/false. */
export function add(el: Element, ...children: Child[]): void {
  append(el, children);
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const ICON_COLS = 16;

/** An icon from the 16×16 icon atlas. size: 16 / 24 / 32 px. */
export function icon(index: number, size: 16 | 24 | 32 = 32, label?: string): HTMLSpanElement {
  const cls = size === 16 ? 'icon sm' : size === 24 ? 'icon md' : 'icon';
  const x = (index % ICON_COLS) * size;
  const y = Math.floor(index / ICON_COLS) * size;
  return h('span', {
    class: cls,
    style: { backgroundPosition: `-${x}px -${y}px` },
    role: label ? 'img' : undefined,
    'aria-label': label,
    'aria-hidden': label ? undefined : 'true',
  });
}

export function itemIcon(itemId: string, size: 16 | 24 | 32 = 32): HTMLSpanElement {
  const item = getItem(itemId);
  return icon(item?.icon ?? 38, size, item?.name);
}

export const ICONS = {
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

/** Segmented bar like the concept HUD. */
export function segBar(value: number, max: number, color: string, segments = 10): HTMLDivElement {
  const on = Math.round(Math.max(0, Math.min(1, value / max)) * segments);
  return h(
    'div',
    { class: 'bar', role: 'meter', 'aria-valuenow': Math.round(value), 'aria-valuemax': max },
    ...Array.from({ length: segments }, (_, i) =>
      h('i', { style: { background: i < on ? color : '' } }),
    ),
  );
}

export function portrait(id: string): HTMLDivElement {
  const ids = ['mia', 'bo', 'dex', 'vera', 'kai', 'ray', 'board', 'player'];
  const i = Math.max(0, ids.indexOf(id));
  return h('div', {
    class: 'portrait',
    style: { backgroundPosition: `-${i * 96}px 0` },
    'aria-hidden': 'true',
  });
}

/** Link to the Terms of Service, opened in a new tab so the game keeps running. */
export function termsLink(label = 'Terms of Service'): HTMLAnchorElement {
  return h(
    'a',
    { href: '/terms.html', target: '_blank', rel: 'noopener', class: 'terms-link' },
    label,
  );
}

/** A Coins price with the coin icon. `short` marks it red (not enough Coins). */
export function price(amount: number, short = false): HTMLSpanElement {
  return h(
    'span',
    { class: `price num${short ? ' short' : ''}`, 'aria-label': `${formatInt(amount)} Coins` },
    icon(6, 16),
    formatInt(amount),
  );
}
