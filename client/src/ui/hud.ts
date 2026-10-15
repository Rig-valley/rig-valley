/** In-game HUD, laid out like the concept screen (MASTERPLAN §3). */
import {
  SEASON_NAMES,
  WEATHER_INFO,
  calendar,
  formatClock,
  formatInt,
  formatTokenUnits,
  formatUsd,
  getItem,
  isRigActive,
  type GameEvent,
  type StateDTO,
} from '@rig-valley/shared';
import { rigName, store } from '../store';
import { sfx } from '../audio';
import type { GuideView, Prompt, WorldLabel } from '../game/WorldScene';
import { ICONS, add, clear, h, icon, itemIcon, segBar } from './dom';
import { uiRoot } from './modal';

const WEATHER_ICON: Record<string, number> = {
  sunny: ICONS.sunny,
  rainy: ICONS.rainy,
  heatwave: ICONS.heatwave,
  storm: ICONS.storm,
  snow: ICONS.snow,
};

export interface HudActions {
  openInventory(): void;
  openQuests(): void;
  openMail(): void;
  openRewards(): void;
  openFriends(): void;
  openSettings(): void;
  useItem(itemId: string): void;
}

export class Hud {
  root = h('div', { class: 'passthrough hud', style: 'position:absolute;inset:0' });
  private clock = h('div', { class: 'panel hud-clock' });
  private season = h('div', { class: 'hud-season' });
  private date = h('div', { class: 'hud-date' });
  private time = h('span', { class: 'time' });
  private pausedTag = h('div', { class: 'paused-tag' });
  private energyWrap = h('div', { class: 'hud-energy col' });
  private objective = h('div', {
    class: 'panel hud-objective',
    role: 'status',
    'aria-live': 'polite',
  });
  private banner = h('div', { class: 'panel hud-banner', role: 'status' });
  private balance = h('button', {
    class: 'panel hud-balance',
    type: 'button',
    'aria-label': 'Open Rewards',
  });
  private power = h('div', { class: 'panel hud-power' });
  private hotbar = h('div', { class: 'hud-hotbar' });
  private menu = h('div', { class: 'hud-menu' });
  private prompt = h('div', { class: 'panel hud-prompt' });
  private labels = h('div', { class: 'hud-labels', 'aria-hidden': 'true' });
  private toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  private raf = 0;
  /** Coins shown in the panel; rolls up to the real value for a satisfying count. */
  private shownCoins: number | null = null;
  private coinRoll = 0;
  private coinIcon: HTMLElement | null = null;
  private lastMinute = -1;
  private lastObjectiveKey = '';
  private lastPromptKey = '';

  constructor(private actions: HudActions) {
    this.clock.append(
      this.season,
      this.date,
      h('div', { class: 'row', style: 'gap:8px' }, icon(ICONS.clock, 32), this.time),
      this.pausedTag,
      this.energyWrap,
    );
    this.balance.addEventListener('click', () => actions.openRewards());
    this.root.append(
      this.labels,
      this.clock,
      this.objective,
      this.banner,
      this.balance,
      this.power,
      this.hotbar,
      this.menu,
      this.prompt,
      this.toasts,
    );
    this.prompt.style.display = 'none';
    this.objective.style.display = 'none';
    this.buildMenu();
    store.on('state', (s) => this.render(s));
    store.on('event', (e) => this.onEvent(e));
    store.on('error', (m) => this.toast(m, 'bad'));
    store.on('pause', () => this.renderClock());
    store.on('coinBurst', (b) => {
      this.coinBurst(b.fx, b.fy, b.count);
      if (b.label) this.floatText(b.fx, b.fy, b.label);
    });
  }

  /** Rolls the coin counter up to the new total (spending updates instantly). */
  private rollCoins(el: HTMLElement, to: number): void {
    window.clearTimeout(this.coinRoll);
    const from = this.shownCoins ?? to;
    if (to <= from) {
      this.shownCoins = to;
      el.textContent = formatInt(to);
      return;
    }
    this.balance.classList.remove('bump');
    void this.balance.offsetWidth;
    this.balance.classList.add('bump');
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      this.shownCoins = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      el.textContent = formatInt(this.shownCoins);
      if (t < 1) this.coinRoll = window.setTimeout(step, 30);
    };
    step();
  }

  /** A "+45" that pops up and floats away from a spot on screen. */
  floatText(fx: number, fy: number, text: string): void {
    const el = h('div', { class: 'float-text num' }, text);
    el.style.left = `${fx * 100}%`;
    el.style.top = `${fy * 100}%`;
    this.root.append(el);
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.5)' },
        { transform: 'translate(-50%, -120%) scale(1.15)', offset: 0.25 },
        { transform: 'translate(-50%, -260%) scale(1)' },
      ],
      { duration: 1100, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => el.remove();
  }

  /** Coins fly from a spot on screen (0..1 fractions) into the coin panel. */
  coinBurst(fx: number, fy: number, count = 6): void {
    const target = this.coinIcon;
    if (!target) return;
    const box = this.root.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const scale = box.width / this.root.offsetWidth || 1;
    const sx = fx * this.root.offsetWidth;
    const sy = fy * this.root.offsetHeight;
    const tx = (t.left - box.left) / scale + 8;
    const ty = (t.top - box.top) / scale + 8;
    for (let i = 0; i < count; i++) {
      const c = icon(ICONS.coin, 16);
      c.classList.add('coin-fly');
      c.style.left = `${sx}px`;
      c.style.top = `${sy}px`;
      this.root.append(c);
      const spread = (i - (count - 1) / 2) * 10;
      const anim = c.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.6)' },
          {
            transform: `translate(calc(-50% + ${spread}px), calc(-50% - ${26 + (i % 3) * 8}px)) scale(1.2)`,
            offset: 0.3,
          },
          {
            transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(0.8)`,
          },
        ],
        { duration: 650 + i * 70, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      );
      anim.onfinish = () => {
        c.remove();
        if (i === count - 1) sfx('coin');
      };
    }
  }

  /** Where the player is on screen (0..1), so panels can step aside. */
  playerScreen: () => { fx: number; fy: number } | null = () => null;
  /** Where the current guide target is on screen (0..1). */
  targetScreen: () => { fx: number; fy: number } | null = () => null;

  mount(): void {
    uiRoot().appendChild(this.root);
    const loop = () => {
      this.renderClock();
      this.peek();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  private buildMenu(): void {
    const btn = (ic: number, label: string, key: string, fn: () => void, badgeId?: string) => {
      const b = h(
        'button',
        {
          class: 'slot-btn menu-btn',
          type: 'button',
          'aria-label': `${label} (${key})`,
          title: `${label} (${key})`,
        },
        icon(ic, 32),
        h('span', { class: 'hk' }, key),
      );
      if (badgeId) b.append(h('span', { class: 'badge', id: badgeId, style: 'display:none' }));
      b.addEventListener('click', fn);
      return b;
    };
    this.menu.append(
      btn(ICONS.frame, 'Bag', 'I', () => this.actions.openInventory()),
      btn(ICONS.quest, 'Journal', 'J', () => this.actions.openQuests(), 'badge-quests'),
      btn(ICONS.mail, 'Mail', 'M', () => this.actions.openMail(), 'badge-mail'),
      btn(ICONS.heart, 'Friends', 'F', () => this.actions.openFriends()),
      btn(ICONS.nvda, 'Rewards', 'R', () => this.actions.openRewards()),
      btn(ICONS.wallet, 'Settings', 'Esc', () => this.actions.openSettings()),
    );
  }

  /** Fade HUD panels the player is standing behind, so the character is never hidden. */
  private peek(): void {
    const p = this.playerScreen();
    const root = this.root.getBoundingClientRect();
    const pts = [p, this.targetScreen()]
      .filter((x): x is { fx: number; fy: number } => !!x)
      .map((q) => ({ x: root.left + q.fx * root.width, y: root.top + q.fy * root.height }));
    for (const el of [
      this.clock,
      this.objective,
      this.banner,
      this.balance,
      this.power,
      this.hotbar,
      this.menu,
    ]) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const under = pts.some(
        (q) => q.x > r.left - 24 && q.x < r.right + 24 && q.y > r.top - 30 && q.y < r.bottom + 24,
      );
      el.classList.toggle('peek', under);
    }
  }

  private renderClock(): void {
    const s = store.state;
    if (!s) return;
    const m = Math.floor(store.displayMinute() / 10);
    const paused = store.paused || s.farm.paused;
    const tag = paused ? 'Time paused' : '';
    if (m === this.lastMinute && this.pausedTag.textContent === tag) return;
    this.lastMinute = m;
    this.time.textContent = formatClock(store.displayMinute());
    this.pausedTag.textContent = tag;
    this.time.style.color = store.displayMinute() >= 24 * 60 ? 'var(--red)' : '';
  }

  render(s: StateDTO): void {
    const cal = calendar(s.farm.day);
    this.season.textContent = `${SEASON_NAMES[cal.season]} · Year ${cal.year}`;
    this.date.textContent = `${cal.weekday}, Day ${cal.dayOfSeason}`;
    this.lastMinute = -1;
    this.renderClock();

    clear(this.energyWrap);
    const e = s.farm.energy;
    const ec = e < 20 ? 'var(--red)' : 'var(--yellow)';
    this.energyWrap.append(
      h(
        'div',
        { class: 'spread stat-line' },
        h('span', { class: 'row', style: 'gap:6px' }, icon(ICONS.energy, 16), 'Energy'),
        h('b', { class: 'num', style: { color: ec } }, `${e} / ${s.farm.maxEnergy}`),
      ),
      segBar(e, s.farm.maxEnergy, ec),
    );

    clear(this.banner);
    const wi = WEATHER_INFO[s.farm.weatherTomorrow];
    this.banner.append(
      icon(
        WEATHER_ICON[s.farm.weather] ?? ICONS.sunny,
        24,
        `Today: ${WEATHER_INFO[s.farm.weather].name}`,
      ),
      h('span', { class: 'hud-banner-today' }, WEATHER_INFO[s.farm.weather].name),
      h('span', { class: 'dot' }),
      h('span', null, s.festival ? `${s.festival.name} today in the town square!` : wi.forecast),
    );

    clear(this.balance);
    const r = s.rewards;
    const coinsEl = h('span', { class: 'coins num' }, formatInt(this.shownCoins ?? s.farm.coins));
    this.coinIcon = icon(ICONS.coin, 32);
    this.balance.append(
      h('div', { class: 'label' }, 'Coins'),
      h('div', { class: 'row', style: 'gap:8px' }, this.coinIcon, coinsEl),
      h(
        'div',
        { class: 'hud-nvda num' },
        `${formatTokenUnits(r.pendingUnits, r.decimals)} ${r.symbol}`,
        r.priceUsd ? h('span', { class: 'hud-usd' }, ` ≈ ${formatUsd(r.pendingUsd)}`) : null,
      ),
    );
    this.rollCoins(coinsEl, s.farm.coins);

    clear(this.power);
    const draw = s.farm.powerDraw;
    const cap = s.farm.powerCapacity;
    const over = draw > cap;
    const active = s.rigs.filter((rr) => isRigActive(rr));
    const avg = active.length ? active.reduce((t, rr) => t + rr.temps.total, 0) / active.length : 0;
    const tempColor = avg > 80 ? 'var(--red)' : avg > 65 ? 'var(--warm-0)' : 'var(--green)';
    add(
      this.power,
      h(
        'div',
        { class: 'col', style: 'gap:4px' },
        h(
          'div',
          { class: 'spread stat-line' },
          h('span', null, 'Power'),
          h(
            'b',
            { class: 'num', style: { color: over ? 'var(--red)' : 'var(--yellow)' } },
            `${formatInt(draw)} / ${formatInt(cap)} W`,
          ),
        ),
        segBar(draw, cap, over ? 'var(--red)' : 'var(--yellow)'),
        over ? h('div', { class: 'stat-warn' }, 'Over capacity! The breaker trips tonight.') : null,
      ),
      h(
        'div',
        { class: 'col', style: 'gap:4px' },
        h(
          'div',
          { class: 'spread stat-line' },
          h('span', null, 'Avg. temp'),
          h(
            'b',
            { class: 'num', style: { color: tempColor } },
            active.length ? `${Math.round(avg)}°C` : '—',
          ),
        ),
        segBar(avg, 100, tempColor),
      ),
    );

    clear(this.hotbar);
    const order = [
      'screwdriver',
      'cloth',
      'thermal_paste',
      'cooling_lv1',
      'cooling_lv2',
      'cooling_lv3',
      'frame_t1',
      'frame_t2',
      'cpu_common',
      'cpu_uncommon',
      'cpu_rare',
      'cpu_epic',
      'coffee',
      'sandwich',
      'energy_drink',
    ];
    const have = order.filter((id) => store.qty(id) > 0);
    for (let i = 0; i < 8; i++) {
      const id = have[i];
      if (!id) {
        this.hotbar.append(h('div', { class: 'slot-btn empty', 'aria-hidden': 'true' }));
        continue;
      }
      const q = store.qty(id);
      const name = getItem(id)?.name ?? id;
      const b = h(
        'button',
        { class: 'slot-btn', type: 'button', title: name, 'aria-label': `${name}, ${q} in bag` },
        itemIcon(id, 32),
        q > 1 ? h('span', { class: 'qty num' }, String(q)) : null,
      );
      b.addEventListener('click', () => this.actions.useItem(id));
      this.hotbar.append(b);
    }

    const unread = s.mail.filter((m) => !m.read).length;
    const mb = document.getElementById('badge-mail');
    if (mb) {
      mb.textContent = String(unread);
      mb.style.display = unread ? 'flex' : 'none';
    }
    const qb = document.getElementById('badge-quests');
    if (qb) {
      const n = s.quests.filter((q) => q.state === 'active').length;
      qb.textContent = String(n);
      qb.style.display = n ? 'flex' : 'none';
    }
  }

  /** Objective panel under the clock: what to do next, how, and how far. */
  showGuide(g: GuideView): void {
    const o = g.objective;
    const key = o ? `${o.id}|${o.title}|${o.detail}|${o.goal}|${g.distance}` : '';
    if (key === this.lastObjectiveKey) return;
    const changed = (o?.id ?? '') !== this.lastObjectiveKey.split('|')[0];
    this.lastObjectiveKey = key;
    if (!o) {
      this.objective.style.display = 'none';
      return;
    }
    clear(this.objective);
    const dist =
      g.distance === null
        ? null
        : g.distance <= 1
          ? 'You’re here — press E'
          : `${g.distance} m away · follow the yellow arrow`;
    add(
      this.objective,
      h(
        'div',
        { class: 'spread' },
        h('span', { class: 'label' }, o.step ? 'Tutorial' : 'Objective'),
        o.step ? h('span', { class: 'obj-step num' }, `${o.step.index} / ${o.step.total}`) : null,
      ),
      h('div', { class: 'obj-title' }, o.title),
      h('div', { class: 'obj-detail' }, o.detail),
      o.goal ? h('div', { class: 'obj-goal' }, o.goal) : null,
      dist ? h('div', { class: 'obj-dist' }, h('span', { class: 'obj-arrow' }, '▶'), dist) : null,
    );
    this.objective.style.display = 'flex';
    if (changed) {
      this.objective.classList.remove('pop');
      void this.objective.offsetWidth;
      this.objective.classList.add('pop');
      if (o.step && o.step.index > 1) sfx('quest');
    }
  }

  showPrompt(p: Prompt | null): void {
    if (!p) {
      this.prompt.style.display = 'none';
      this.lastPromptKey = '';
      return;
    }
    const key = `${p.title}|${p.status}|${p.detail}|${p.action}`;
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      clear(this.prompt);
      add(
        this.prompt,
        h('div', { class: 'title' }, p.title),
        p.status
          ? h('div', { class: 'status', style: { color: p.statusColor ?? '' } }, p.status)
          : null,
        p.detail ? h('div', { class: 'detail' }, p.detail) : null,
        h(
          'div',
          { class: 'row action', style: 'gap:8px' },
          h('span', { class: 'key' }, 'E'),
          h('span', null, p.action),
        ),
      );
    }
    this.prompt.style.display = 'flex';
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    const pw = this.prompt.offsetWidth || 280;
    const ph = this.prompt.offsetHeight || 120;
    const ax = p.screen.fx * W;
    const ay = p.screen.fy * H;
    const clampY = (y: number) => Math.min(H - ph - 110, Math.max(16, y));
    const clampX = (x: number) => Math.min(W - pw - 16, Math.max(16, x));
    // Right of the target, else left, below, above — whichever keeps the HUD panels readable.
    const spots = [
      { x: ax + 30, y: clampY(ay - ph / 2) },
      { x: ax - 30 - pw, y: clampY(ay - ph / 2) },
      { x: clampX(ax - pw / 2), y: clampY(ay + 34) },
      { x: clampX(ax - pw / 2), y: clampY(ay - ph - 40) },
    ];
    const panels = [this.objective, this.balance, this.clock, this.power, this.banner]
      .filter((el) => el.offsetParent && el.style.display !== 'none')
      .map((el) => ({
        l: el.offsetLeft,
        t: el.offsetTop,
        r: el.offsetLeft + el.offsetWidth,
        b: el.offsetTop + el.offsetHeight,
      }));
    const fits = (q: { x: number; y: number }) =>
      q.x >= 16 &&
      q.x + pw <= W - 16 &&
      !panels.some((r) => q.x < r.r && q.x + pw > r.l && q.y < r.b && q.y + ph > r.t);
    const at = spots.find(fits) ?? { x: clampX(spots[0]!.x), y: spots[0]!.y };
    this.prompt.style.left = `${Math.round(at.x)}px`;
    this.prompt.style.top = `${Math.round(at.y)}px`;
  }

  showLabels(list: WorldLabel[]): void {
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    while (this.labels.children.length < list.length)
      this.labels.append(h('div', { class: 'npc-label' }));
    [...this.labels.children].forEach((el, i) => {
      const l = list[i];
      const e = el as HTMLElement;
      if (!l) {
        e.style.display = 'none';
        return;
      }
      e.style.display = '';
      if (e.textContent !== l.text) e.textContent = l.text;
      e.style.left = `${Math.round(l.fx * W)}px`;
      e.style.top = `${Math.round(l.fy * H)}px`;
    });
  }

  toast(text: string, tone: 'info' | 'good' | 'warn' | 'bad' = 'info'): void {
    if (tone === 'bad') sfx('error');
    const t = h('div', { class: `panel toast ${tone}` }, text);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild?.remove();
    setTimeout(() => t.remove(), tone === 'bad' ? 5500 : 4200);
  }

  private onEvent(e: GameEvent): void {
    switch (e.kind) {
      case 'toast':
        this.toast(e.text, e.tone);
        break;
      case 'harvest': {
        sfx('harvest');
        const s = store.state;
        const units = s ? formatTokenUnits(e.nvdaUnits, s.rewards.decimals, 6) : e.nvdaUnits;
        if (e.capped) {
          this.toast(
            `Harvest! +${formatInt(e.coins)} Coins. Today's ${s?.rewards.symbol ?? 'NVDA'} limit is reached — more ${s?.rewards.symbol ?? 'NVDA'} after the daily reset (see Rewards).`,
            'good',
          );
          break;
        }
        this.toast(
          `Harvest! +${formatInt(e.coins)} Coins · +${units} ${s?.rewards.symbol ?? 'NVDA'} (${formatUsd(e.usd)})${e.boosted ? ' · Beginner boost' : ''}`,
          'good',
        );
        break;
      }
      case 'quest_done':
        sfx('quest');
        this.toast(`Quest complete: ${e.title}! Reward: ${e.reward}`, 'good');
        break;
      case 'level_up':
        sfx('levelup');
        this.toast(
          `${e.npc.charAt(0).toUpperCase() + e.npc.slice(1)} is now friendship level ${e.level}!${e.perk ? ` ${e.perk}` : ''}`,
          'good',
        );
        break;
      case 'overheat':
        sfx('overheat');
        this.toast(
          `${rigName(e.rigId)} overheated! Clean, repaste or repair it, then switch it on.`,
          'bad',
        );
        break;
      case 'ready':
        sfx('coin');
        break;
      case 'stage':
        sfx('levelup');
        this.toast(`Unlocked: ${e.name}!`, 'good');
        break;
      case 'mail':
        if (e.count > 0) sfx('mail');
        break;
    }
  }
}
