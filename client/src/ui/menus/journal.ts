/** Mailbox, quest journal and inventory. */
import {
  HATS,
  RARITY_NAMES,
  getItem,
  isFood,
  renderLetter,
  type HatId,
  type MailDTO,
} from '@rig-valley/shared';
import { store } from '../../store';
import { sfx } from '../../audio';
import { ICONS, add, clear, h, icon, itemIcon, portrait } from '../dom';
import { showModal } from '../modal';

const FROM_PORTRAIT: [RegExp, string][] = [
  [/^Uncle Ray/, 'ray'],
  [/^Mia/, 'mia'],
  [/^Bo/, 'bo'],
  [/^Dex/, 'dex'],
  [/^Vera/, 'vera'],
  [/^Kai/, 'kai'],
  [/^Town Board/, 'board'],
];

export function letterView(m: Pick<MailDTO, 'templateId' | 'params'>): HTMLElement {
  const l = renderLetter(m.templateId, m.params);
  const p = FROM_PORTRAIT.find(([re]) => re.test(l.from))?.[1] ?? 'board';
  return h(
    'div',
    { class: 'letter' },
    h(
      'div',
      { class: 'row', style: 'gap:12px;margin-bottom:10px' },
      portrait(p),
      h(
        'div',
        { class: 'col', style: 'gap:2px' },
        h('b', { style: 'font-size:22px' }, l.subject),
        h('span', { class: 'from' }, `From: ${l.from}`),
      ),
    ),
    l.body,
  );
}

export function openMail(initialId?: number): void {
  const list = h('div', {
    class: 'col',
    style: 'width:300px;gap:6px;overflow-y:auto;max-height:470px',
  });
  const view = h('div', { class: 'grow', style: 'overflow-y:auto;max-height:520px' });
  const tidy = h('button', { class: 'btn small', type: 'button' }, 'Throw away read letters');
  tidy.addEventListener('click', async () => {
    tidy.setAttribute('disabled', '');
    for (const m of store.state!.mail.filter((x) => x.read && x.id !== selected))
      await store.act({ type: 'delete_mail', mailId: m.id });
    render();
  });
  const body = h(
    'div',
    { class: 'row', style: 'align-items:flex-start;gap:14px' },
    h('div', { class: 'col', style: 'gap:8px;flex:0 0 auto' }, list, tidy),
    view,
  );
  let selected = initialId;
  const render = () => {
    const s = store.state!;
    clear(list);
    if (!s.mail.length) list.append(h('p', { class: 'dim' }, 'Your mailbox is empty.'));
    const readCount = s.mail.filter((x) => x.read && x.id !== selected).length;
    tidy.style.display = readCount ? '' : 'none';
    tidy.textContent = `Throw away read letters (${readCount})`;
    tidy.removeAttribute('disabled');
    for (const m of s.mail) {
      const l = renderLetter(m.templateId, m.params);
      const b = h(
        'button',
        {
          class: `list-item${m.id === selected ? ' selected' : ''}`,
          type: 'button',
          style: 'cursor:pointer;text-align:left;color:inherit;width:100%',
        },
        icon(ICONS.mail, 24),
        h(
          'div',
          { class: 'grow col', style: 'gap:0' },
          h('b', { style: { color: m.read ? 'var(--metal-3)' : 'var(--metal-4)' } }, l.subject),
          h('span', { class: 'dim', style: 'font-size:15px' }, `${l.from} · Day ${m.day}`),
        ),
        m.read ? null : h('span', { style: 'color:var(--magenta)' }, '●'),
      );
      b.addEventListener('click', () => {
        selected = m.id;
        show(m);
      });
      list.append(b);
    }
  };
  const show = (m: MailDTO) => {
    clear(view);
    const del = h('button', { class: 'btn small', type: 'button' }, 'Throw away');
    del.addEventListener('click', async () => {
      await store.act({ type: 'delete_mail', mailId: m.id });
      selected = undefined;
      clear(view);
      render();
    });
    view.append(letterView(m), h('div', { class: 'row', style: 'margin-top:8px' }, del));
    if (!m.read) void store.act({ type: 'read_mail', mailId: m.id }).then(render);
    else render();
  };
  showModal('Mailbox', body, { wide: true, key: 'mail' });
  render();
  const s = store.state!;
  const first = s.mail.find((x) => x.id === initialId) ?? s.mail.find((x) => !x.read) ?? s.mail[0];
  if (first) {
    selected = first.id;
    show(first);
  }
}

export function openQuests(): void {
  const s = store.state!;
  const active = s.quests.filter((q) => q.state === 'active');
  const done = s.quests.filter((q) => q.state === 'done');
  const kindLabel = { main: 'Story', relationship: 'Friend', daily: 'Daily' } as const;
  const card = (q: (typeof s.quests)[number]) =>
    h(
      'div',
      { class: `list-item${q.state === 'done' ? ' done' : ''}`, style: 'align-items:flex-start' },
      icon(ICONS.quest, 32),
      h(
        'div',
        { class: 'grow col', style: 'gap:4px' },
        h(
          'div',
          { class: 'row', style: 'gap:8px' },
          h('b', { style: 'font-size:18px' }, q.title),
          h(
            'span',
            {
              class: 'tag',
              style: {
                color:
                  q.kind === 'main'
                    ? 'var(--magenta)'
                    : q.kind === 'daily'
                      ? 'var(--yellow)'
                      : 'var(--green)',
              },
            },
            kindLabel[q.kind],
          ),
        ),
        h('p', { class: 'dim' }, q.description),
        ...q.progress.map((p) =>
          h(
            'div',
            { class: 'row', style: 'gap:8px;font-size:15px' },
            h(
              'span',
              { style: { color: p.current >= p.target ? 'var(--green)' : 'var(--metal-4)' } },
              p.current >= p.target ? '✔' : '○',
            ),
            h('span', null, p.text),
            h('span', { class: 'dim' }, `${Math.min(p.current, p.target)}/${p.target}`),
          ),
        ),
      ),
    );
  showModal(
    'Journal',
    [
      h('h3', { class: 'label' }, 'Active'),
      ...(active.length
        ? active.map(card)
        : [h('p', { class: 'dim' }, 'No active quests. Check your mailbox!')]),
      done.length ? h('h3', { class: 'label', style: 'margin-top:8px' }, 'Completed') : h('span'),
      ...done.slice(0, 12).map(card),
    ],
    { wide: true, key: 'quests' },
  );
}

export function openInventory(): void {
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(8,1fr);gap:6px' });
  const detail = h('div', { class: 'panel', style: 'min-height:120px' });
  const hats = h('div', { class: 'row', style: 'flex-wrap:wrap' });
  let selected = '';
  const render = () => {
    const s = store.state!;
    clear(grid);
    const items = [...s.inventory].sort((a, b) =>
      (getItem(a.itemId)?.type ?? '').localeCompare(getItem(b.itemId)?.type ?? ''),
    );
    for (const e of items) {
      const it = getItem(e.itemId);
      if (!it) continue;
      const b = h(
        'button',
        {
          class: `slot-btn${it.id === selected ? ' selected' : ''}`,
          type: 'button',
          title: it.name,
          'aria-label': `${it.name}, ${e.qty}`,
          'aria-pressed': String(it.id === selected),
        },
        itemIcon(it.id, 32),
        e.qty > 1 ? h('span', { class: 'qty' }, String(e.qty)) : null,
      );
      b.addEventListener('click', () => showDetail(it.id));
      grid.append(b);
    }
    for (let i = items.length; i < 24; i++) grid.append(h('div', { class: 'slot-btn empty' }));
    clear(hats);
    for (const hat of s.farm.ownedHats) {
      const btn = h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          'aria-pressed': String(s.farm.character.hat === hat),
        },
        hat === 'none' ? 'No hat' : (HATS.find((x) => x.id === hat)?.name ?? hat),
      );
      if (s.farm.character.hat === hat) btn.style.borderColor = 'var(--cyan)';
      btn.addEventListener('click', async () => {
        await store.act({ type: 'set_hat', hat: hat as HatId });
        render();
      });
      hats.append(btn);
    }
  };
  const showDetail = (itemId: string) => {
    const it = getItem(itemId)!;
    selected = itemId;
    for (const b of grid.querySelectorAll<HTMLElement>('.slot-btn'))
      b.classList.toggle('selected', b.title === it.name);
    clear(detail);
    const actions = h('div', { class: 'row' });
    if (isFood(it)) {
      const eat = h(
        'button',
        { class: 'btn primary small', type: 'button' },
        `Eat (+${it.energy} Energy)`,
      );
      eat.addEventListener('click', async () => {
        if (await store.act({ type: 'eat', itemId })) {
          sfx('coin');
          render();
          if (store.qty(itemId) > 0) showDetail(itemId);
          else clear(detail);
        }
      });
      actions.append(eat);
    }
    const tips: Record<string, string> = {
      frame: 'Use it on an empty field slot to build a rig.',
      cooling_unit: 'Place it on an empty field slot.',
      decor: 'Place it on an empty field slot.',
      paint: 'Use it from a rig menu.',
      cpu: 'Install it from a rig menu.',
      cooler: 'Install it from a rig menu.',
      psu: 'Install it from a rig menu.',
      gift: 'Give it to someone in town.',
    };
    add(
      detail,
      h(
        'div',
        { class: 'row' },
        itemIcon(itemId, 32),
        h(
          'div',
          { class: 'col', style: 'gap:2px' },
          h(
            'b',
            { class: it.rarity ? `rarity-${it.rarity}` : '', style: 'font-size:20px' },
            it.name,
          ),
          it.rarity
            ? h(
                'span',
                { class: `rarity-${it.rarity}`, style: 'font-size:15px' },
                RARITY_NAMES[it.rarity],
              )
            : null,
        ),
      ),
      h('p', { style: 'margin:8px 0' }, it.description),
      tips[it.type] ? h('p', { class: 'dim', style: 'font-size:15px' }, tips[it.type]!) : null,
      actions,
    );
  };
  showModal('Bag', [grid, detail, h('h3', { class: 'label' }, 'Hats'), hats], {
    wide: true,
    key: 'bag',
  });
  render();
  detail.append(h('p', { class: 'dim' }, 'Select an item to see what it does.'));
}
