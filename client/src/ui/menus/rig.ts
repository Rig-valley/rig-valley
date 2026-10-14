/** Rig, slot, cooling unit and decoration menus. */
import {
  ENERGY_COST,
  FRESH_PASTE,
  RARITY_NAMES,
  RIG_STATUS_LABEL,
  getItem,
  isCoolingUnit,
  isFrame,
  partSlotOf,
  rarityRank,
  slotAt,
  type Item,
  type RigDTO,
} from '@rig-valley/shared';
import { rigName, store } from '../../store';
import { sfx } from '../../audio';
import { ICONS, h, icon, itemIcon } from '../dom';
import { confirmModal, showModal, type ModalHandle } from '../modal';

const STATUS_COLOR: Record<string, string> = {
  ready: 'var(--coin)',
  mining: 'var(--cyan)',
  booting: 'var(--yellow)',
  overheat: 'var(--red)',
  broken: 'var(--red)',
  off: 'var(--metal-3)',
  installed: 'var(--green)',
  frame: 'var(--metal-3)',
};

function inv(): { item: Item; qty: number }[] {
  return (store.state?.inventory ?? [])
    .map((i) => ({ item: getItem(i.itemId)!, qty: i.qty }))
    .filter((x) => x.item);
}

function stat(ic: number, label: string, value: string, color?: string) {
  return h(
    'div',
    { class: 'list-item', style: 'padding:6px 10px' },
    icon(ic, 24),
    h('span', { class: 'grow dim' }, label),
    h('b', { style: { color: color ?? '' } }, value),
  );
}

export function openRigMenu(rigId: number): void {
  let m: ModalHandle | null = null;
  let open = true;
  const holder = h('div');
  // Re-render in place after an action — never close/reopen (no flicker, and a menu the
  // player already closed stays closed even if the server answers late).
  const refresh = () => {
    if (open) holder.replaceChildren(render());
  };
  const render = (): HTMLElement => {
    const rig = store.state?.rigs.find((r) => r.id === rigId);
    if (!rig) return h('p', null, 'This rig is gone.');
    return rigBody(rig, refresh, () => m?.close());
  };
  const rig = store.state?.rigs.find((r) => r.id === rigId);
  if (!rig) return;
  holder.append(render());
  m = showModal(rigName(rig.id), holder, {
    wide: true,
    key: `rig${rigId}`,
    onClose: () => (open = false),
  });
}

async function run(
  action: Parameters<typeof store.act>[0],
  after?: () => void,
  sound?: Parameters<typeof sfx>[0],
) {
  const r = await store.act(action);
  if (r) {
    if (sound) sfx(sound);
    after?.();
  }
}

function rigBody(rig: RigDTO, refresh: () => void, close: () => void): HTMLElement {
  const frame = getItem(rig.frameId);
  const t = rig.temps;
  const tempColor = t.total > 95 ? 'var(--red)' : t.total > 80 ? 'var(--warm-0)' : 'var(--green)';
  const energy = store.state?.farm.energy ?? 0;
  // Tutorial: light up the button the player should press next.
  const tut = rig.tutorial ? (store.state?.farm.tutorialStep ?? -1) : -1;

  const actions: HTMLElement[] = [];
  const action = (
    label: string,
    cost: number | null,
    enabled: boolean,
    fn: () => void,
    cls = '',
  ) => {
    const b = h(
      'button',
      {
        class: `btn ${cls}`,
        type: 'button',
        disabled: !enabled || (cost !== null && energy < cost),
      },
      label,
      cost !== null
        ? h('span', { class: 'dim', style: 'font-size:15px;margin-left:6px' }, `${cost} Energy`)
        : null,
    );
    b.addEventListener('click', fn);
    actions.push(b);
  };

  if (rig.status === 'ready')
    action(
      'Claim harvest',
      null,
      true,
      () => void run({ type: 'claim', rigId: rig.id }, close),
      'gold',
    );
  if (rig.cpuId && !rig.powered)
    action(
      'Switch on',
      null,
      rig.condition > 0 && !rig.overheat,
      () => void run({ type: 'power', rigId: rig.id, on: true }, refresh, 'power_on'),
      'primary tut-glow',
    );
  if (rig.powered)
    action(
      'Switch off',
      null,
      true,
      () => void run({ type: 'power', rigId: rig.id, on: false }, refresh, 'power_off'),
    );
  action(
    `Clean${store.qty('cloth') ? '' : ' (need cloth)'}`,
    ENERGY_COST.clean,
    store.qty('cloth') > 0 && (rig.dust > 0 || rig.overheat),
    () => void run({ type: 'clean', rigId: rig.id }, refresh, 'clean'),
    tut === 4 ? 'tut-glow' : '',
  );
  action(
    `Repaste (${store.qty('thermal_paste')} paste)`,
    ENERGY_COST.repaste,
    store.qty('thermal_paste') > 0 && !!rig.cpuId && (rig.paste < FRESH_PASTE || rig.overheat),
    () => void run({ type: 'repaste', rigId: rig.id }, refresh, 'clean'),
  );
  action(
    `Repair${store.qty('screwdriver') ? '' : ' (need screwdriver)'}`,
    ENERGY_COST.repair,
    store.qty('screwdriver') > 0 && (rig.condition < 100 || rig.overheat),
    () => void run({ type: 'repair', rigId: rig.id }, refresh, 'build'),
  );

  const paints = inv().filter((x) => x.item.type === 'paint');
  if (paints.length) {
    action('Paint…', null, true, () =>
      pickItem(
        'Paint this rig',
        paints.map((p) => p.item),
        (it) => void run({ type: 'paint_rig', rigId: rig.id, itemId: it.id }, refresh),
      ),
    );
  }
  const frames = inv().filter((x) => isFrame(x.item) && x.item.id !== rig.frameId);
  if (frames.length) {
    action('Change frame…', ENERGY_COST.install, true, () =>
      pickItem(
        'Move the rig into a new frame',
        frames.map((f) => f.item),
        (it) => void run({ type: 'swap_frame', rigId: rig.id, frameId: it.id }, refresh, 'build'),
      ),
    );
  }
  action(
    'Take apart',
    null,
    !rig.tutorial || (store.state?.farm.tutorialStep ?? 0) >= 7,
    async () => {
      if (
        await confirmModal(
          'Take this rig apart?',
          'All parts and the frame go back to your bag. Current cycle progress is lost.',
          'Take apart',
        )
      ) {
        await run({ type: 'remove_rig', rigId: rig.id }, close, 'build');
      }
    },
    'danger',
  );

  const partRow = (slot: 'cpu' | 'cooler' | 'psu', label: string, stock: string) => {
    const id = slot === 'cpu' ? rig.cpuId : slot === 'cooler' ? rig.coolerId : rig.psuId;
    const item = id ? getItem(id) : undefined;
    const options = inv().filter((x) => partSlotOf(x.item) === slot);
    const maxR = isFrame(frame) ? frame.maxRarity : 'common';
    const install = h(
      'button',
      {
        class: `btn small${slot === 'cpu' && !item && options.length > 0 ? ' tut-glow' : ''}`,
        type: 'button',
        disabled: options.length === 0,
      },
      item ? 'Swap…' : 'Install…',
    );
    install.addEventListener('click', () =>
      pickItem(
        `Install a ${label}`,
        options.map((o) => o.item),
        (it) => void run({ type: 'install', rigId: rig.id, itemId: it.id }, refresh, 'build'),
        (it) =>
          it.rarity && rarityRank(it.rarity) > rarityRank(maxR)
            ? `Needs a better frame (max ${RARITY_NAMES[maxR]})`
            : null,
        `${ENERGY_COST.install} Energy`,
      ),
    );
    const remove = h('button', { class: 'btn small', type: 'button', disabled: !item }, 'Remove');
    remove.addEventListener(
      'click',
      () => void run({ type: 'uninstall', rigId: rig.id, slot }, refresh),
    );
    return h(
      'div',
      { class: 'list-item' },
      item
        ? itemIcon(item.id, 32)
        : icon(slot === 'cpu' ? ICONS.cpu : slot === 'cooler' ? ICONS.fan : ICONS.psu, 32),
      h(
        'div',
        { class: 'grow col', style: 'gap:2px' },
        h('span', { class: 'dim', style: 'font-size:15px' }, label),
        item
          ? h('b', { class: `rarity-${item.rarity}` }, item.name)
          : h('span', { class: 'dim' }, slot === 'cpu' ? 'Empty — install a CPU to mine' : stock),
      ),
      install,
      remove,
    );
  };

  const breakdown = [
    `Air ${t.ambient}°C`,
    t.cpu ? `CPU +${t.cpu}` : '',
    t.cooler ? `Cooler −${t.cooler}` : '',
    t.frame ? `Frame −${t.frame}` : '',
    t.field ? `River −${t.field}` : '',
    t.coolingUnits ? `Cooling units −${t.coolingUnits}` : '',
    t.neighbors ? `Neighbors +${t.neighbors}` : '',
    t.dust ? `Dust +${t.dust}` : '',
    t.paste ? `Old paste +${t.paste}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return h(
    'div',
    { class: 'col', style: 'gap:12px' },
    h(
      'div',
      { class: 'spread' },
      h(
        'div',
        { class: 'col', style: 'gap:2px' },
        h(
          'span',
          { class: 'dim' },
          `${frame?.name ?? 'Frame'} · Tier ${isFrame(frame) ? frame.tier : 1}`,
        ),
        h(
          'b',
          { style: { fontSize: '26px', color: STATUS_COLOR[rig.status] } },
          RIG_STATUS_LABEL[rig.status],
        ),
      ),
      rig.status === 'mining' || rig.status === 'booting'
        ? h(
            'div',
            { class: 'col', style: 'width:300px;gap:4px' },
            h(
              'span',
              { class: 'dim', style: 'font-size:15px' },
              `Cycle ${Math.floor(rig.progress * 100)}%`,
            ),
            h(
              'div',
              { class: 'progress-track' },
              ...Array.from({ length: 20 }, (_, i) =>
                h('i', { class: i < rig.progress * 20 ? 'on' : '' }),
              ),
            ),
          )
        : null,
    ),
    h(
      'div',
      { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px' },
      stat(ICONS.speed, 'Speed', rig.speed ? `${rig.speed.toFixed(1)} / day` : '—'),
      stat(ICONS.temp, 'Temp', `${Math.round(t.total)}°C`, tempColor),
      stat(
        ICONS.health,
        'Health',
        `${Math.round(rig.condition)}%`,
        rig.condition < 25 ? 'var(--red)' : undefined,
      ),
      stat(
        ICONS.dust,
        'Dust',
        `${Math.round(rig.dust)}%`,
        rig.dust > 60 ? 'var(--warn)' : undefined,
      ),
      stat(ICONS.paste, 'Paste', `${Math.round(rig.paste)}%`),
      stat(ICONS.plug, 'Power', `${rig.watts} W`),
    ),
    h(
      'p',
      { class: 'dim', style: 'font-size:15px' },
      breakdown,
      t.total > 80
        ? h('span', { class: 'warn' }, ' · Above 80°C it slows down, above 95°C it overheats.')
        : null,
    ),
    partRow('cpu', 'CPU', ''),
    partRow('cooler', 'Cooler', 'Stock fan'),
    partRow('psu', 'PSU', 'Stock PSU'),
    h('div', { class: 'row', style: 'flex-wrap:wrap' }, ...actions),
  );
}

/** Generic item picker. `blocked` returns a reason to disable an option. */
export function pickItem(
  title: string,
  items: Item[],
  onPick: (i: Item) => void,
  blocked?: (i: Item) => string | null,
  note?: string,
): void {
  const unique = [...new Map(items.map((i) => [i.id, i])).values()];
  const list = unique.map((it) => {
    const why = blocked?.(it) ?? null;
    const b = h(
      'button',
      {
        class: 'list-item',
        type: 'button',
        disabled: !!why,
        style: 'cursor:pointer;text-align:left;color:inherit;width:100%',
      },
      itemIcon(it.id, 32),
      h(
        'div',
        { class: 'grow col', style: 'gap:2px' },
        h('b', { class: it.rarity ? `rarity-${it.rarity}` : '' }, it.name),
        h('span', { class: 'dim', style: 'font-size:15px' }, why ?? it.description),
      ),
      h('span', { class: 'dim' }, `×${store.qty(it.id)}`),
    );
    b.addEventListener('click', () => {
      m.close();
      onPick(it);
    });
    return b;
  });
  const m: ModalHandle = showModal(
    title,
    [
      note ? h('p', { class: 'dim' }, note) : h('span'),
      ...(list.length ? list : [h('p', { class: 'dim' }, 'Nothing suitable in your bag.')]),
    ],
    { narrow: false },
  );
}

export function openSlotMenu(x: number, y: number): void {
  const slot = slotAt(x, y);
  if (!slot) return;
  const s = store.state!;
  const frames = inv().filter((i) => isFrame(i.item));
  const coolers = inv().filter((i) => isCoolingUnit(i.item));
  const decor = inv().filter((i) => i.item.type === 'decor');
  const rigCount = s.rigs.length;
  const opt = (ic: number, title: string, desc: string, enabled: boolean, fn: () => void) => {
    const b = h(
      'button',
      {
        class: 'list-item',
        type: 'button',
        disabled: !enabled,
        style: 'cursor:pointer;text-align:left;color:inherit;width:100%',
      },
      icon(ic, 32),
      h(
        'div',
        { class: 'grow col', style: 'gap:2px' },
        h('b', null, title),
        h('span', { class: 'dim', style: 'font-size:15px' }, desc),
      ),
    );
    b.addEventListener('click', () => {
      m.close();
      fn();
    });
    return b;
  };
  const m: ModalHandle = showModal(`Empty slot · ${slot.field.name}`, [
    opt(
      ICONS.frame,
      'Build a rig',
      frames.length
        ? `Uses a rig frame and ${ENERGY_COST.build} Energy. Rigs: ${rigCount}.`
        : 'You need a rig frame. Mia sells them at the Hardware Store.',
      frames.length > 0,
      () =>
        pickItem(
          'Choose a frame',
          frames.map((f) => f.item),
          (it) =>
            void run(
              { type: 'build_rig', x, y, frameId: it.id },
              () => {
                // Next step is almost always "install a CPU": open the new rig right away.
                const rig = store.state?.rigs.find((r) => r.x === x && r.y === y);
                if (rig) openRigMenu(rig.id);
              },
              'build',
            ),
          undefined,
          `${ENERGY_COST.build} Energy`,
        ),
    ),
    opt(
      ICONS.cooling,
      'Place a cooling unit',
      coolers.length
        ? 'Cools every rig around it. Free to place.'
        : 'No cooling units in your bag. Mia and Dex sell them.',
      coolers.length > 0,
      () =>
        pickItem(
          'Choose a cooling unit',
          coolers.map((f) => f.item),
          (it) => void run({ type: 'place_cooling', x, y, itemId: it.id }, undefined, 'build'),
        ),
    ),
    opt(
      22,
      'Place a decoration',
      decor.length ? 'Make the field yours.' : 'No decorations in your bag.',
      decor.length > 0,
      () =>
        pickItem(
          'Choose a decoration',
          decor.map((f) => f.item),
          (it) => void run({ type: 'place_decor', x, y, itemId: it.id }, undefined, 'build'),
        ),
    ),
  ]);
}

export function openPlacedMenu(kind: 'cooling' | 'decor', x: number, y: number): void {
  const s = store.state!;
  const placed =
    kind === 'cooling'
      ? s.coolingUnits.find((c) => c.x === x && c.y === y)
      : s.decor.find((d) => d.x === x && d.y === y);
  if (!placed) return;
  const item = getItem(placed.itemId);
  const pick = h('button', { class: 'btn', type: 'button' }, 'Pick up');
  const body = h(
    'div',
    { class: 'col' },
    h('div', { class: 'row' }, itemIcon(placed.itemId, 32), h('p', null, item?.description ?? '')),
    isCoolingUnit(item)
      ? h(
          'p',
          { class: 'dim' },
          `Cools rigs within ${item.radius} slot${item.radius > 1 ? 's' : ''} by ${item.cooling}°C. Uses ${item.watts} W.`,
        )
      : null,
    h('div', { class: 'row' }, pick),
  );
  const m = showModal(item?.name ?? 'Item', body, { narrow: true });
  pick.addEventListener('click', () => {
    m.close();
    void store.act(
      kind === 'cooling' ? { type: 'pickup_cooling', x, y } : { type: 'pickup_decor', x, y },
    );
  });
}
