/** Shops, café, Repair Shop service, Power Substation and the Market Board. */
import {
  MINIGAMES,
  NPCS,
  POWER_UPGRADES,
  SHOPS,
  SHOP_REPAIR_BASE,
  calendar,
  formatInt,
  friendshipLevel,
  getItem,
  isCoolingUnit,
  isShopOpen,
  maxShopRarityForStage,
  rarityRank,
  powerUpgradeDiscount,
  repairDiscount,
  shopHoursText,
  shopPrice,
  shopStock,
  type ShopContext,
  type ShopId,
} from '@rig-valley/shared';
import { api } from '../../api';
import { rigName, store } from '../../store';
import { sfx } from '../../audio';
import { ICONS, clear, h, icon, itemIcon, portrait, price } from '../dom';
import { showModal, type ModalHandle } from '../modal';
import { openCoffeeRush } from './minigame';

function ctx(): ShopContext {
  const s = store.state!;
  return {
    stage: s.farm.stage,
    friendship: Object.fromEntries(s.relations.map((r) => [r.npc, r.points])),
  };
}

function coinsLine(): HTMLElement {
  return h(
    'div',
    { class: 'row', style: 'gap:6px' },
    icon(ICONS.coin, 24),
    h('b', { id: 'shop-coins' }, formatInt(store.state?.farm.coins ?? 0)),
  );
}

function refreshCoins(): void {
  const el = document.getElementById('shop-coins');
  if (el) el.textContent = formatInt(store.state?.farm.coins ?? 0);
}

export function openShop(shopId: ShopId): void {
  const s = store.state!;
  const shop = SHOPS[shopId];
  const cal = calendar(s.farm.day);
  if (!isShopOpen(shop, store.displayMinute(), cal.weekdayIndex)) {
    showModal(
      shop.name,
      h(
        'div',
        { class: 'col' },
        h('p', null, 'Closed right now.'),
        h('p', { class: 'dim' }, `Hours: ${shopHoursText(shop)}`),
      ),
      { narrow: true },
    );
    return;
  }
  if (shopId === 'market') return void openMarket();
  const owner = shop.owner ? NPCS[shop.owner] : null;
  const tabs = h('div', { class: 'tabs tabs-main', role: 'tablist' });
  const content = h('div', { class: 'col' });
  const header = h(
    'div',
    { class: 'row', style: 'gap:14px' },
    owner ? portrait(owner.id) : null,
    h(
      'div',
      { class: 'col', style: 'gap:4px' },
      owner ? h('b', { style: 'color:var(--magenta)' }, owner.name) : null,
      h('p', null, shop.greeting),
      h('span', { class: 'dim', style: 'font-size:15px' }, shopHoursText(shop)),
      shopId === 'hardware' || shopId === 'repair'
        ? h(
            'span',
            { class: 'dim', style: 'font-size:15px' },
            'Want to sell parts? Use the Market Board in the town square.',
          )
        : null,
    ),
  );

  const views: [string, () => void][] = [['Buy', () => renderBuy(content, shopId)]];
  if (shopId === 'repair') views.push(['Repairs', () => renderRepairs(content)]);
  if (shopId === 'substation') {
    views.unshift(['Power upgrades', () => renderPower(content)]);
    // Owing Vera? The bill comes first.
    const bill: [string, () => void] = ['Power bill', () => renderBill(content)];
    if ((store.state?.farm.billDebt ?? 0) > 0) views.unshift(bill);
    else views.splice(1, 0, bill);
  }
  if (shopId === 'cafe') views.push(['Odd jobs', () => renderCafeJobs(content, () => m)]);

  const select = (i: number) => {
    [...tabs.children].forEach((c, j) => c.setAttribute('aria-selected', String(i === j)));
    clear(content);
    views[i]![1]();
  };
  views.forEach(([label], i) => {
    const b = h('button', { class: 'btn small', type: 'button', role: 'tab' }, label);
    b.addEventListener('click', () => select(i));
    tabs.append(b);
  });
  // A single tab is just noise; with several, keep the window from jumping between tabs.
  if (views.length < 2) tabs.style.display = 'none';
  else content.style.minHeight = '330px';
  const m = showModal(shop.name, [header, tabs, content], { wide: true, extra: coinsLine() });
  const off = store.on('state', () => refreshCoins());
  void m.closed.then(off);
  select(0);
}

const CATEGORIES: { id: string; label: string; types: string[] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'parts', label: 'Rig parts', types: ['cpu', 'cooler', 'psu', 'frame'] },
  { id: 'cooling', label: 'Cooling', types: ['cooling_unit'] },
  { id: 'care', label: 'Tools & care', types: ['tool', 'consumable', 'key'] },
  { id: 'food', label: 'Food', types: ['food'] },
  { id: 'gifts', label: 'Gifts', types: ['gift'] },
  { id: 'style', label: 'Style', types: ['decor', 'paint', 'outfit'] },
];

function renderBuy(el: HTMLElement, shopId: ShopId, category = 'all'): void {
  clear(el);
  const c = ctx();
  const s = store.state!;
  const all = shopStock(shopId, c);
  if (!all.length) {
    el.append(h('p', { class: 'dim' }, 'Nothing for sale here.'));
    return;
  }
  // Category filter (only categories this shop actually sells)
  const cats = CATEGORIES.filter(
    (cat) => cat.id === 'all' || all.some((i) => cat.types.includes(i.type)),
  );
  if (cats.length > 2) {
    const bar = h('div', { class: 'tabs tabs-chips', role: 'tablist', 'aria-label': 'Categories' });
    for (const cat of cats) {
      const b = h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          role: 'tab',
          'aria-selected': String(cat.id === category),
        },
        cat.label,
      );
      b.addEventListener('click', () => renderBuy(el, shopId, cat.id));
      bar.append(b);
    }
    el.append(bar);
  }
  const def = CATEGORIES.find((x) => x.id === category);
  const items = category === 'all' || !def ? all : all.filter((i) => def.types.includes(i.type));
  for (const it of items) {
    let unit = shopPrice(it, shopId, c);
    if (s.rareRestock && it.rarity === 'rare') unit = Math.round(unit * 0.8);
    const qtyInput = h('input', {
      class: 'input',
      type: 'number',
      min: '1',
      max: '99',
      value: '1',
      style: 'width:64px',
      'aria-label': `Quantity of ${it.name}`,
    });
    const owned = it.type === 'outfit' && s.farm.ownedHats.includes(it.value as never);
    const have = store.qty(it.id);
    const tooPoor = s.farm.coins < unit;
    const buy = h(
      'button',
      {
        class: 'btn small primary',
        type: 'button',
        disabled: owned || tooPoor,
        title: tooPoor ? 'Not enough Coins' : undefined,
      },
      owned ? 'Owned' : 'Buy',
    );
    buy.addEventListener('click', async () => {
      const qty = Math.max(1, Math.min(99, Math.floor(Number(qtyInput.value) || 1)));
      const r = await store.act({ type: 'buy', shopId, itemId: it.id, qty });
      if (r) {
        sfx('coin');
        const top = el.closest('.modal-body')?.scrollTop ?? 0;
        renderBuy(el, shopId, category);
        const body = el.closest('.modal-body');
        if (body) body.scrollTop = top;
      }
    });
    el.append(
      h(
        'div',
        { class: 'list-item' },
        itemIcon(it.id, 32),
        h(
          'div',
          { class: 'grow col', style: 'gap:2px' },
          h(
            'div',
            { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
            h('b', { class: it.rarity ? `rarity-${it.rarity}` : '' }, it.name),
            it.rarity
              ? h('span', { class: `tag rarity-${it.rarity}` }, it.rarity.toUpperCase())
              : null,
            have > 0 && it.type !== 'outfit'
              ? h('span', { class: 'tag', style: 'color:var(--metal-3)' }, `You have ${have}`)
              : null,
          ),
          h('span', { class: 'dim', style: 'font-size:15px' }, it.description),
        ),
        price(unit, tooPoor && !owned),
        it.type === 'outfit' ? null : qtyInput,
        buy,
      ),
    );
  }
}

function renderRepairs(el: HTMLElement): void {
  const s = store.state!;
  const d = repairDiscount(ctx());
  const rigs = s.rigs.filter((r) => r.condition < 100 || r.overheat);
  el.append(
    h(
      'p',
      { class: 'dim' },
      `Dex walks over and fixes a rig up like new: full Health, no dust, no overheat. No Energy needed.${d < 1 ? ' Friend discount applied!' : ''}`,
    ),
  );
  if (!rigs.length)
    el.append(h('p', null, 'All your rigs are in great shape. Dex is almost disappointed.'));
  for (const r of rigs) {
    const cost = Math.round(SHOP_REPAIR_BASE * (1 + (100 - r.condition) / 100) * d);
    const tooPoor = s.farm.coins < cost;
    const b = h(
      'button',
      { class: 'btn small primary', type: 'button', disabled: tooPoor },
      'Repair · ',
      price(cost, tooPoor),
    );
    b.addEventListener('click', async () => {
      if (await store.act({ type: 'shop_repair', rigId: r.id })) {
        sfx('build');
        clear(el);
        renderRepairs(el);
      }
    });
    el.append(
      h(
        'div',
        { class: 'list-item' },
        icon(ICONS.health, 32),
        h(
          'div',
          { class: 'grow' },
          h('b', null, rigName(r.id)),
          h(
            'span',
            { class: 'dim' },
            ` · Health ${Math.round(r.condition)}%${r.overheat ? ' · Overheated' : ''}`,
          ),
        ),
        b,
      ),
    );
  }
}

function renderBill(el: HTMLElement): void {
  const s = store.state!;
  const debt = s.farm.billDebt;
  el.append(
    h(
      'p',
      null,
      `${s.farm.powerKwh} kWh used since the last bill. The bill arrives every Monday morning and is paid automatically from your Coins.`,
    ),
  );
  if (debt <= 0) {
    el.append(h('p', { class: 'good' }, "You're all paid up. Vera gives you an approving nod."));
    return;
  }
  el.append(
    s.farm.powerCut
      ? h(
          'p',
          { class: 'bad' },
          'Your power is cut off. Your rigs stay off until the bill is paid in full.',
        )
      : h(
          'p',
          { class: 'warn' },
          "If next Monday's bill can't be paid in full either, Vera cuts your power until you settle up.",
        ),
  );
  const pay = Math.min(debt, Math.max(0, s.farm.coins));
  const b = h(
    'button',
    { class: 'btn small primary', type: 'button', disabled: pay <= 0 },
    'Pay · ',
    price(pay, pay <= 0),
  );
  b.addEventListener('click', async () => {
    b.setAttribute('disabled', '');
    if (await store.act({ type: 'pay_bill' })) sfx('coin');
    clear(el);
    renderBill(el);
  });
  el.append(
    h(
      'div',
      { class: 'list-item' },
      icon(ICONS.plug, 32),
      h(
        'div',
        { class: 'grow col', style: 'gap:2px' },
        h('b', null, 'Owed to Vera'),
        h('span', { class: 'dim', style: 'font-size:15px' }, `${formatInt(debt)} Coins`),
      ),
      b,
    ),
  );
  if (pay < debt)
    el.append(
      h(
        'p',
        { class: 'dim' },
        pay > 0
          ? `You have ${formatInt(s.farm.coins)} Coins. Paying that now leaves ${formatInt(debt - pay)} owed.`
          : 'You have no Coins right now. Shiny scraps, Coffee Rush shifts and selling spare parts can help.',
      ),
    );
}

function renderPower(el: HTMLElement): void {
  const s = store.state!;
  const d = powerUpgradeDiscount(ctx());
  el.append(
    h(
      'p',
      null,
      `Capacity: ${formatInt(s.farm.powerCapacity)} W · Using ${formatInt(s.farm.powerDraw)} W · ${s.farm.powerKwh} kWh since the last bill.`,
    ),
  );
  for (const u of POWER_UPGRADES) {
    const owned = s.farm.powerUpgrades.includes(u.id);
    const lockedStage = s.farm.stage < u.stage;
    const needs = u.requires && !s.farm.powerUpgrades.includes(u.requires);
    const cost = Math.round(u.cost * d);
    const tooPoor = s.farm.coins < cost;
    const b = h(
      'button',
      {
        class: 'btn small primary',
        type: 'button',
        disabled: owned || lockedStage || !!needs || tooPoor,
      },
      ...(owned ? ['Installed'] : ['Buy · ', price(cost, tooPoor && !lockedStage && !needs)]),
    );
    b.addEventListener('click', async () => {
      if (await store.act({ type: 'power_upgrade', upgradeId: u.id })) {
        sfx('power_on');
        clear(el);
        renderPower(el);
      }
    });
    const why = lockedStage
      ? `Unlocks at stage ${u.stage}`
      : needs
        ? `Needs ${POWER_UPGRADES.find((x) => x.id === u.requires)?.name}`
        : '';
    el.append(
      h(
        'div',
        { class: 'list-item' },
        icon(ICONS.plug, 32),
        h(
          'div',
          { class: 'grow col', style: 'gap:2px' },
          h('b', null, u.name),
          h('span', { class: 'dim', style: 'font-size:15px' }, u.description),
          why ? h('span', { class: 'warn', style: 'font-size:15px' }, why) : null,
        ),
        b,
      ),
    );
  }
}

function renderCafeJobs(el: HTMLElement, m: () => ModalHandle | undefined): void {
  const s = store.state!;
  const game = MINIGAMES.coffee_rush;
  const play = h(
    'button',
    { class: 'btn primary', type: 'button', disabled: s.farm.daily.minigamePlayed },
    s.farm.daily.minigamePlayed ? 'Come back tomorrow' : `Help Bo · ${game.energy} Energy`,
  );
  play.addEventListener('click', () => {
    m()?.close();
    openCoffeeRush();
  });
  el.append(
    h(
      'div',
      { class: 'list-item' },
      icon(12, 32),
      h(
        'div',
        { class: 'grow col', style: 'gap:2px' },
        h('b', null, game.name),
        h(
          'span',
          { class: 'dim', style: 'font-size:15px' },
          `Bo is swamped. Make drinks by pressing the right arrows. Up to ${game.maxScore * (game.coinsPerPoint + game.tipPerPerfect)} Coins with tips, once a day.`,
        ),
      ),
      play,
    ),
  );
  if (friendshipLevel(s.relations.find((r) => r.npc === 'bo')?.points ?? 0) >= 5) {
    const free = h(
      'button',
      { class: 'btn', type: 'button', disabled: s.farm.daily.freeCoffee },
      s.farm.daily.freeCoffee ? 'Had it today' : 'Free coffee',
    );
    free.addEventListener('click', async () => {
      if (await store.act({ type: 'free_coffee' })) free.setAttribute('disabled', '');
    });
    el.append(
      h(
        'div',
        { class: 'list-item' },
        icon(12, 32),
        h(
          'div',
          { class: 'grow' },
          h('b', null, 'Best friend perk'),
          h('span', { class: 'dim' }, ' · One free coffee a day.'),
        ),
        free,
      ),
    );
  }
}

// ------------------------------------------------------------------ Market Board
export async function openMarket(): Promise<void> {
  const tabs = h('div', { class: 'tabs tabs-main', role: 'tablist' });
  const content = h('div', { class: 'col', style: 'min-height:260px' });
  const m = showModal(
    'Market Board',
    [
      h(
        'p',
        { class: 'dim' },
        'Prices change every day and with the seasons. Buy low, sell high, nap often.',
      ),
      tabs,
      content,
    ],
    { wide: true, extra: coinsLine() },
  );
  const off = store.on('state', () => refreshCoins());
  void m.closed.then(off);
  let data: Awaited<ReturnType<typeof api.market>>;
  try {
    data = await api.market();
  } catch {
    content.append(h('p', { class: 'bad' }, "Couldn't load today's prices."));
    return;
  }
  const render = (mode: 'sell' | 'buy') => {
    [...tabs.children].forEach((c, j) =>
      c.setAttribute('aria-selected', String((mode === 'sell' ? 0 : 1) === j)),
    );
    clear(content);
    if (data.sellBonus > 1)
      content.append(
        h('p', { class: 'good' }, 'Harvest Night bonus: the board pays 20% more today!'),
      );
    const st = store.state!;
    const maxR = rarityRank(maxShopRarityForStage(st.farm.stage));
    const quotes = data.quotes.filter((q) => {
      if (mode === 'sell') return store.qty(q.itemId) > 0;
      // Only list what this garage can actually use right now.
      const it = getItem(q.itemId);
      if (!it) return false;
      if (it.rarity && rarityRank(it.rarity) > maxR) return false;
      return !(isCoolingUnit(it) && it.stage > st.farm.stage);
    });
    if (!quotes.length)
      content.append(
        h(
          'p',
          { class: 'dim' },
          mode === 'sell' ? 'You have nothing the board wants to buy.' : 'Nothing listed today.',
        ),
      );
    for (const q of quotes) {
      const it = getItem(q.itemId)!;
      const unit = mode === 'sell' ? Math.round(q.sell * data.sellBonus) : q.buy;
      const trend = q.trend === 0 ? 'Normal price' : `${q.trend > 0 ? '+' : ''}${q.trend}% today`;
      const tooPoor = mode === 'buy' && st.farm.coins < unit;
      const qtyInput = h('input', {
        class: 'input',
        type: 'number',
        min: '1',
        max: String(mode === 'sell' ? store.qty(q.itemId) : 99),
        value: '1',
        style: 'width:64px',
        'aria-label': 'Quantity',
      });
      const b = h(
        'button',
        {
          class: `btn small ${mode === 'sell' ? 'gold' : 'primary'}`,
          type: 'button',
          disabled: tooPoor,
        },
        mode === 'sell' ? 'Sell' : 'Buy',
      );
      b.addEventListener('click', async () => {
        const qty = Math.max(1, Math.floor(Number(qtyInput.value) || 1));
        const r = await store.act(
          mode === 'sell'
            ? { type: 'sell', itemId: q.itemId, qty }
            : { type: 'market_buy', itemId: q.itemId, qty },
        );
        if (r) {
          sfx('coin');
          render(mode);
        }
      });
      content.append(
        h(
          'div',
          { class: 'list-item' },
          itemIcon(q.itemId, 32),
          h(
            'div',
            { class: 'grow col', style: 'gap:2px' },
            h('b', { class: it.rarity ? `rarity-${it.rarity}` : '' }, it.name),
            h(
              'span',
              { class: 'dim', style: 'font-size:15px' },
              mode === 'sell' ? `You have ${store.qty(q.itemId)}` : it.description,
            ),
          ),
          h(
            'span',
            {
              style: {
                color: q.trend > 0 ? 'var(--green)' : q.trend < 0 ? 'var(--red)' : 'var(--metal-3)',
                minWidth: '110px',
                textAlign: 'right',
                fontSize: '15px',
              },
              title: 'Compared with the usual price',
            },
            trend,
          ),
          price(unit, tooPoor),
          qtyInput,
          b,
        ),
      );
    }
  };
  for (const [i, label] of ['Sell', 'Buy'].entries()) {
    const b = h('button', { class: 'btn small', type: 'button', role: 'tab' }, label);
    b.addEventListener('click', () => render(i === 0 ? 'sell' : 'buy'));
    tabs.append(b);
  }
  render('sell');
}
