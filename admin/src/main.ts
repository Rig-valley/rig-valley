/** Rig Valley admin panel (MASTERPLAN §13). */
import '@fontsource/tiny5/400.css';
import { loadDigitFont } from './digits';
import './styles.css';

import {
  DEFAULT_SEASONAL_MODIFIERS,
  MARKET_CATEGORIES,
  SEASONS,
  formatInt,
  formatTokenUnits,
  formatUsd,
  getItem,
  marketItems,
  shortAddress,
  type AdminConfigDTO,
  type AdminDashboardDTO,
  type AdminPlayerDTO,
} from '@rig-valley/shared';

void loadDigitFont();

const TOKEN_KEY = 'rv.admin.token';
const app = document.getElementById('app')!;
let token = sessionStorage.getItem(TOKEN_KEY) ?? '';
let refreshTimer = 0;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: (Node | string | number | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children)
    if (c !== null && c !== undefined && c !== false)
      el.append(typeof c === 'object' ? c : String(c));
  return el;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401) {
    const hadSession = !!sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    token = '';
    login(
      hadSession
        ? 'Your session ended (the server restarted or the token changed). Sign in again.'
        : 'Wrong token. Copy the ADMIN_TOKEN value from the .env file exactly.',
    );
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error(json.message ?? `Request failed (${res.status})`);
  return json as T;
}

// ------------------------------------------------------------------ shell
type View = 'dashboard' | 'rewards' | 'market' | 'players';

function shell(view: View): HTMLElement {
  window.clearInterval(refreshTimer);
  app.replaceChildren();
  const nav = h('nav');
  const views: [View, string][] = [
    ['dashboard', 'Dashboard'],
    ['rewards', 'Rewards'],
    ['market', 'Market'],
    ['players', 'Players'],
  ];
  for (const [v, label] of views) {
    nav.append(
      h('button', { 'aria-current': v === view ? 'page' : null, onclick: () => go(v) }, label),
    );
  }
  nav.append(
    h(
      'button',
      {
        onclick: () => {
          sessionStorage.removeItem(TOKEN_KEY);
          token = '';
          login();
        },
      },
      'Sign out',
    ),
  );
  const main = h('main');
  app.append(
    h('header', null, h('h1', null, 'RIG ', h('span', null, 'VALLEY'), ' · Admin'), nav),
    main,
  );
  return main;
}

function go(v: View): void {
  location.hash = v;
  if (v === 'dashboard') void dashboard();
  if (v === 'rewards') void rewards();
  if (v === 'market') void market();
  if (v === 'players') players();
}

function login(msg = ''): void {
  window.clearInterval(refreshTimer);
  app.replaceChildren();
  const input = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Admin token' });
  const out = h('div', { class: 'msg bad' }, msg);
  const form = h(
    'form',
    { class: 'panel login' },
    h('h2', null, 'Rig Valley Admin'),
    h('label', null, 'Admin token', input),
    h(
      'p',
      { class: 'hint' },
      'Use the ADMIN_TOKEN value from the .env file in the project folder (the line ADMIN_TOKEN=…).',
    ),
    out,
    h('button', { class: 'primary', type: 'submit' }, 'Sign in'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    token = input.value.trim().replace(/^ADMIN_TOKEN=/, '');
    if (!token) {
      out.textContent = 'Paste the admin token first.';
      input.focus();
      return;
    }
    out.textContent = '';
    try {
      await call('GET', '/dashboard');
      sessionStorage.setItem(TOKEN_KEY, token);
      go((location.hash.slice(1) as View) || 'dashboard');
    } catch (err) {
      if ((err as Error).message !== 'unauthorized') out.textContent = (err as Error).message;
    }
  });
  app.append(form);
  input.focus();
}

// ------------------------------------------------------------------ dashboard
function stat(label: string, value: string, sub = '', cls = ''): HTMLElement {
  return h(
    'div',
    { class: 'panel stat' },
    h('div', { class: 'label' }, label),
    h('div', { class: `value ${cls}` }, value),
    sub ? h('div', { class: 'sub' }, sub) : null,
  );
}

async function dashboard(): Promise<void> {
  const main = shell('dashboard');
  const body = h(
    'div',
    { style: 'display:flex;flex-direction:column;gap:16px' },
    h('p', { class: 'dim' }, 'Loading…'),
  );
  main.append(body);
  const render = async () => {
    let d: AdminDashboardDTO;
    try {
      d = await call<AdminDashboardDTO>('GET', '/dashboard');
    } catch {
      return;
    }
    const tok = (u: string | null) =>
      u === null ? '—' : `${formatTokenUnits(u, d.decimals, 4)} ${d.symbol}`;
    const usd = (u: string | null) =>
      u === null || d.priceUsd === null
        ? ''
        : `≈ ${formatUsd((Number(BigInt(u) / 10n ** BigInt(Math.max(0, d.decimals - 6))) / 1e6) * d.priceUsd)}`;
    const pauseBtn = h(
      'button',
      {
        class: d.withdrawalsPaused ? 'primary' : 'danger',
        onclick: async () => {
          if (
            !d.withdrawalsPaused &&
            !confirm(
              'Pause all withdrawals? Players keep earning; nothing is sent until you resume.',
            )
          )
            return;
          await call(
            'POST',
            d.withdrawalsPaused ? '/withdrawals/resume' : '/withdrawals/pause',
            {},
          );
          void render();
        },
      },
      d.withdrawalsPaused ? 'Resume withdrawals' : 'Pause withdrawals',
    );
    body.replaceChildren(
      ...d.alerts.map((a) => h('div', { class: `alert ${a.level}` }, a.text)),
      h(
        'div',
        { class: 'grid' },
        stat(
          'Paid today',
          tok(d.paidTodayUnits),
          `${usd(d.paidTodayUnits)} · ${d.withdrawalsToday} withdrawals`,
        ),
        stat(
          'Paid this week',
          tok(d.paidWeekUnits),
          `${usd(d.paidWeekUnits)} · ${d.withdrawalsWeek} withdrawals`,
        ),
        stat(
          'Pending liabilities',
          tok(d.pendingLiabilitiesUnits),
          `${usd(d.pendingLiabilitiesUnits)} · owed to players + in flight`,
        ),
        stat(
          'Contract balance',
          tok(d.contractBalanceUnits),
          d.contractPaused ? 'Contract is PAUSED on-chain' : usd(d.contractBalanceUnits),
          d.lowBalanceAlert ? 'bad' : 'ok',
        ),
        stat(
          'NVDA price',
          d.priceUsd === null ? 'unavailable' : formatUsd(d.priceUsd),
          d.priceUpdatedAt ? `updated ${new Date(d.priceUpdatedAt).toLocaleString('en-US')}` : '',
          d.priceUsd === null ? 'bad' : '',
        ),
        stat(
          'Gas relayer',
          d.relayerBalanceWei === null
            ? '—'
            : `${formatTokenUnits(d.relayerBalanceWei, 18, 5)} ETH`,
          d.relayerAddress ? shortAddress(d.relayerAddress) : 'Players pay their own gas',
          d.lowRelayerAlert ? 'bad' : d.relayerBalanceWei === null ? '' : 'ok',
        ),
        stat('In-flight withdrawals', formatInt(d.withdrawalsPending)),
        stat('Players', formatInt(d.players)),
        stat('Harvests today', formatInt(d.harvestsToday)),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Withdrawals'),
        h(
          'p',
          null,
          d.withdrawalsPaused
            ? h('span', { class: 'warn' }, 'Paused from the admin panel.')
            : h('span', { class: 'ok' }, 'Running.'),
        ),
        h('div', { class: 'row' }, pauseBtn),
        h(
          'p',
          { class: 'dim' },
          'This stops the server from issuing vouchers. To stop claims on-chain as well, use the contract’s pause() from the treasury or pauser key.',
        ),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Chain'),
        d.chain
          ? h(
              'p',
              null,
              `${d.chain.chainName} (id ${d.chain.chainId}) · distributor `,
              h(
                'a',
                {
                  href: `${d.chain.explorerUrl}/address/${d.chain.distributor}`,
                  target: '_blank',
                  rel: 'noopener',
                },
                shortAddress(d.chain.distributor ?? ''),
              ),
              ` · token ${shortAddress(d.chain.token ?? '')} · gas ${d.chain.sponsoredGas ? 'sponsored' : 'paid by players'}`,
            )
          : h('p', { class: 'warn' }, 'Not configured — withdrawals are disabled.'),
      ),
    );
  };
  await render();
  refreshTimer = window.setInterval(() => void render(), 15_000);
}

// ------------------------------------------------------------------ rewards config
function numberField(
  label: string,
  value: number,
  step: string,
  attrs: Record<string, string> = {},
): [HTMLElement, () => number] {
  const input = h('input', { type: 'number', step, value: String(value), ...attrs });
  return [h('label', null, label, input), () => Number(input.value)];
}

async function rewards(): Promise<void> {
  const main = shell('rewards');
  const cfg = await call<AdminConfigDTO>('GET', '/config');
  const r = cfg.rewards;
  const { decimals } = await call<AdminDashboardDTO>('GET', '/dashboard');
  const [f1, normal] = numberField('USD per harvest (normal)', r.normalUsdPerHarvest, '0.001', {
    min: '0',
  });
  const [f2, boost] = numberField(
    'USD per harvest (beginner boost)',
    r.boostUsdPerHarvest,
    '0.001',
    { min: '0' },
  );
  const [f3, count] = numberField('Boosted harvests per player', r.boostHarvestCount, '1', {
    min: '0',
  });
  const [f4, minUsd] = numberField('Withdraw unlocks at (USD)', r.withdrawMinUsd, '0.5', {
    min: '0.01',
  });
  const threshold = Number(BigInt(cfg.alertThresholdUnits) / 10n ** BigInt(decimals - 4)) / 1e4;
  const [f5, alertAt] = numberField('Alert when contract balance below (NVDA)', threshold, '1', {
    min: '0',
  });
  const [f6, perDay] = numberField(
    'NVDA harvests per farm per day (0 = no limit)',
    r.dailyNvdaHarvests,
    '1',
    { min: '0' },
  );
  const [f7, ageHours] = numberField(
    'New farms wait before first withdraw (hours)',
    r.withdrawMinFarmAgeHours,
    '1',
    { min: '0' },
  );
  const relayerEth = Number(BigInt(cfg.relayerAlertWei) / 10n ** 12n) / 1e6;
  const [f8, relayerAt] = numberField('Alert when gas relayer below (ETH)', relayerEth, '0.0005', {
    min: '0',
  });
  const msg = h('div', { class: 'msg' });
  const save = h(
    'button',
    {
      class: 'primary',
      onclick: async () => {
        const thresholdUnits = (
          BigInt(Math.round(alertAt() * 1e4)) *
          10n ** BigInt(decimals - 4)
        ).toString();
        const relayerWei = (BigInt(Math.round(relayerAt() * 1e6)) * 10n ** 12n).toString();
        try {
          await call('PUT', '/config', {
            rewards: {
              normalUsdPerHarvest: normal(),
              boostUsdPerHarvest: boost(),
              boostHarvestCount: Math.round(count()),
              withdrawMinUsd: minUsd(),
              dailyNvdaHarvests: Math.round(perDay()),
              withdrawMinFarmAgeHours: ageHours(),
            },
            alertThresholdUnits: thresholdUnits,
            relayerAlertWei: relayerWei,
          });
          msg.className = 'msg ok';
          msg.textContent = 'Saved. Applies to the next harvest — no client update needed.';
        } catch (e) {
          msg.className = 'msg bad';
          msg.textContent = (e as Error).message;
        }
      },
    },
    'Save',
  );
  const preview = h('p', { class: 'dim' });
  const update = () => {
    const toFive = minUsd() / Math.max(0.0001, normal());
    const boostTotal = boost() * count();
    const cap = Math.round(perDay());
    const capText =
      cap > 0
        ? ` One farm can earn at most ${formatUsd(cap * Math.max(boost(), normal()))} a day (${cap} harvests; ${formatUsd(cap * normal())} after the boost).`
        : ' No daily limit per farm.';
    preview.textContent = `Beginner boost pays up to ${formatUsd(boostTotal)} per new player. At the normal rate a player needs ${formatInt(toFive)} harvests per ${formatUsd(minUsd())} withdrawal.${capText}`;
  };
  main.append(
    h(
      'div',
      { class: 'panel' },
      h('h2', null, 'Rewards'),
      h(
        'p',
        { class: 'dim' },
        'Rewards are configured in USD and converted to NVDA at harvest time using the price feed.',
      ),
      h('div', { class: 'row' }, f1, f2, f3, f4, f5, f6, f7, f8),
      preview,
      h('div', { class: 'row' }, save),
      msg,
    ),
  );
  main.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
  update();
}

// ------------------------------------------------------------------ market
async function market(): Promise<void> {
  const main = shell('market');
  const cfg = await call<AdminConfigDTO>('GET', '/config');
  const m = cfg.market;
  const priceInputs = new Map<string, HTMLInputElement>();
  const rows = marketItems().map((it) => {
    const input = h('input', {
      type: 'number',
      min: '1',
      step: '1',
      value: String(m.basePrices[it.id] ?? it.price),
    });
    priceInputs.set(it.id, input);
    return h(
      'tr',
      null,
      h('td', null, it.name),
      h('td', null, it.type),
      h('td', { class: 'num' }, formatInt(it.price)),
      h('td', { class: 'num' }, input),
    );
  });
  const modInputs = new Map<string, HTMLInputElement>();
  const modRows = SEASONS.map((season) =>
    h(
      'tr',
      null,
      h('td', null, season),
      ...MARKET_CATEGORIES.map((cat) => {
        const input = h('input', {
          type: 'number',
          min: '0.1',
          max: '5',
          step: '0.05',
          value: String(
            m.seasonalModifiers[season]?.[cat] ?? DEFAULT_SEASONAL_MODIFIERS[season][cat],
          ),
        });
        modInputs.set(`${season}.${cat}`, input);
        return h('td', { class: 'num' }, input);
      }),
    ),
  );
  const [fSwing, swing] = numberField('Daily price swing (0.15 = ±15%)', m.dailySwing, '0.01', {
    min: '0',
    max: '0.9',
  });
  const [fSell, sell] = numberField('Market pays this share when selling', m.sellRatio, '0.05', {
    min: '0.05',
    max: '1',
  });
  const msg = h('div', { class: 'msg' });
  const save = h(
    'button',
    {
      class: 'primary',
      onclick: async () => {
        const basePrices: Record<string, number> = {};
        for (const [id, input] of priceInputs) {
          const v = Math.round(Number(input.value));
          if (v !== getItem(id)?.price) basePrices[id] = v;
        }
        const seasonalModifiers = Object.fromEntries(
          SEASONS.map((s) => [
            s,
            Object.fromEntries(
              MARKET_CATEGORIES.map((c) => [c, Number(modInputs.get(`${s}.${c}`)!.value)]),
            ),
          ]),
        );
        try {
          await call('PUT', '/config', {
            market: { basePrices, seasonalModifiers, dailySwing: swing(), sellRatio: sell() },
          });
          msg.className = 'msg ok';
          msg.textContent = 'Saved. New prices show on the Market Board right away.';
        } catch (e) {
          msg.className = 'msg bad';
          msg.textContent = (e as Error).message;
        }
      },
    },
    'Save market',
  );
  main.append(
    h(
      'div',
      { class: 'panel' },
      h('h2', null, 'Market Board'),
      h('div', { class: 'row' }, fSwing, fSell),
      h('div', { class: 'row' }, save),
      msg,
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Seasonal modifiers'),
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Season'),
            ...MARKET_CATEGORIES.map((c) => h('th', { class: 'num' }, c)),
          ),
        ),
        h('tbody', null, ...modRows),
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Base prices (Coins)'),
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Item'),
            h('th', null, 'Type'),
            h('th', { class: 'num' }, 'Catalog'),
            h('th', { class: 'num' }, 'Market base'),
          ),
        ),
        h('tbody', null, ...rows),
      ),
    ),
  );
}

// ------------------------------------------------------------------ players
function players(): void {
  const main = shell('players');
  const input = h('input', {
    placeholder: '0x…',
    style: 'width:440px',
    'aria-label': 'Wallet address',
  });
  const out = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const form = h(
    'form',
    { class: 'panel' },
    h('h2', null, 'Player lookup'),
    h(
      'div',
      { class: 'row' },
      h('label', null, 'Wallet address', input),
      h('button', { class: 'primary', type: 'submit' }, 'Look up'),
    ),
    h('p', { class: 'dim' }, 'Read-only view of a farm and its harvest log.'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.replaceChildren(h('p', { class: 'dim' }, 'Loading…'));
    try {
      const p = await call<AdminPlayerDTO>('GET', `/players/${input.value.trim()}`);
      out.replaceChildren(...playerView(p));
    } catch (err) {
      out.replaceChildren(h('p', { class: 'bad' }, (err as Error).message));
    }
  });
  main.append(form, out);
  input.focus();
}

function playerView(p: AdminPlayerDTO): HTMLElement[] {
  const s = p.state;
  const f = s.farm;
  const r = s.rewards;
  return [
    h(
      'div',
      { class: 'grid' },
      stat('Farm', f.farmName, `${f.character.name} · stage ${f.stage} · day ${f.day}`),
      stat('Coins', formatInt(f.coins), `energy ${f.energy}/${f.maxEnergy}`),
      stat(
        'Pending rewards',
        `${formatTokenUnits(r.pendingUnits, r.decimals, 6)} ${r.symbol}`,
        r.priceUsd ? formatUsd(r.pendingUsd) : '',
      ),
      stat('Harvests', formatInt(f.harvestCount), `${r.boostLeft} boosted left`),
      stat(
        'Rigs',
        formatInt(s.rigs.length),
        `${s.rigs.filter((x) => x.status === 'mining' || x.status === 'ready').length} running · ${f.powerDraw}/${f.powerCapacity} W`,
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Rigs'),
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ...['#', 'Tile', 'Frame', 'CPU', 'Status', 'Temp', 'Health', 'Dust', 'Cycle'].map((t) =>
              h('th', null, t),
            ),
          ),
        ),
        h(
          'tbody',
          null,
          ...s.rigs.map((g) =>
            h(
              'tr',
              null,
              h('td', null, g.id),
              h('td', null, `${g.x},${g.y}`),
              h('td', null, getItem(g.frameId)?.name ?? g.frameId),
              h('td', null, g.cpuId ? (getItem(g.cpuId)?.name ?? g.cpuId) : '—'),
              h('td', null, g.status),
              h('td', { class: 'num' }, `${Math.round(g.temps.total)}°C`),
              h('td', { class: 'num' }, `${Math.round(g.condition)}%`),
              h('td', { class: 'num' }, `${Math.round(g.dust)}%`),
              h('td', { class: 'num' }, `${Math.round(g.progress * 100)}%`),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Harvest log'),
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ...['Time', 'Rig', 'Coins', 'USD', 'NVDA', 'Price', 'Boost'].map((t) =>
              h('th', null, t),
            ),
          ),
        ),
        h(
          'tbody',
          null,
          ...p.harvests.map((x) =>
            h(
              'tr',
              null,
              h('td', null, new Date(x.ts).toLocaleString('en-US')),
              h('td', null, x.rigId),
              h('td', { class: 'num' }, x.coins),
              h('td', { class: 'num' }, formatUsd(x.usd)),
              h('td', { class: 'num' }, formatTokenUnits(x.nvdaUnits, r.decimals, 6)),
              h('td', { class: 'num' }, x.priceUsed === null ? '—' : formatUsd(x.priceUsed)),
              h('td', null, x.boosted ? 'yes' : ''),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Withdrawals'),
      p.withdrawals.length
        ? h(
            'table',
            null,
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                ...['Time', 'Amount', 'USD', 'Status', 'Tx'].map((t) => h('th', null, t)),
              ),
            ),
            h(
              'tbody',
              null,
              ...p.withdrawals.map((w) =>
                h(
                  'tr',
                  null,
                  h('td', null, new Date(w.createdAt).toLocaleString('en-US')),
                  h('td', { class: 'num' }, formatTokenUnits(w.amountUnits, r.decimals, 6)),
                  h('td', { class: 'num' }, formatUsd(w.usdAtRequest)),
                  h(
                    'td',
                    null,
                    w.status,
                    w.error ? h('span', { class: 'dim' }, ` (${w.error})`) : null,
                  ),
                  h(
                    'td',
                    null,
                    w.explorerUrl
                      ? h(
                          'a',
                          { href: w.explorerUrl, target: '_blank', rel: 'noopener' },
                          shortAddress(w.txHash ?? ''),
                        )
                      : '—',
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'dim' }, 'None yet.'),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Coins ledger'),
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Time'),
            h('th', { class: 'num' }, 'Change'),
            h('th', null, 'Reason'),
          ),
        ),
        h(
          'tbody',
          null,
          ...p.coinsLedger
            .slice(0, 80)
            .map((l) =>
              h(
                'tr',
                null,
                h('td', null, new Date(l.ts).toLocaleString('en-US')),
                h(
                  'td',
                  { class: `num ${l.delta < 0 ? 'bad' : 'ok'}` },
                  l.delta > 0 ? `+${l.delta}` : l.delta,
                ),
                h('td', null, l.reason),
              ),
            ),
        ),
      ),
    ),
  ];
}

if (token) go((location.hash.slice(1) as View) || 'dashboard');
else login();
