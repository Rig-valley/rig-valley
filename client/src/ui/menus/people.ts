/** NPC dialogue, gifts, quest deliveries and the friendship screen. */
import {
  FRIENDSHIP_PER_LEVEL,
  NPCS,
  findQuest,
  friendshipLevel,
  getItem,
  type GameEvent,
  type NpcId,
} from '@rig-valley/shared';
import { store } from '../../store';
import { sfx } from '../../audio';
import { ICONS, clear, h, icon, portrait } from '../dom';
import { openModal, showModal, type ModalHandle } from '../modal';
import { pickItem } from './rig';
import { openCoffeeRush } from './minigame';
import { openShop } from './shop';

/** Talk to an NPC: shows their line, then options. */
export async function openNpc(npc: NpcId): Promise<void> {
  const def = NPCS[npc];
  const text = h('div', { class: 'text' }, '…');
  const options = h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin-top:8px' });
  const panel = h(
    'div',
    { class: 'panel dialogue' },
    portrait(npc),
    h(
      'div',
      { class: 'col grow', style: 'gap:6px' },
      h('div', { class: 'name' }, `${def.name} · ${def.role}`),
      text,
      options,
    ),
  );
  const m = openModal(panel, { clear: true });

  let lastLine = '';
  const off = store.on('event', (e: GameEvent) => {
    if (e.kind === 'dialogue' && e.npc === npc) {
      lastLine = e.text;
      typeText(text, e.text);
    }
  });
  void m.closed.then(off);
  await store.act({ type: 'talk', npc });
  if (!lastLine) typeText(text, 'Hi there!');
  renderOptions(npc, options, m, text);
}

function typeText(el: HTMLElement, s: string): void {
  el.textContent = '';
  let i = 0;
  const step = () => {
    i += 2;
    el.textContent = s.slice(0, i);
    if (i % 6 === 0) sfx('blip');
    if (i < s.length) setTimeout(step, 18);
  };
  step();
}

function renderOptions(npc: NpcId, el: HTMLElement, m: ModalHandle, text: HTMLElement): void {
  clear(el);
  const s = store.state!;
  const def = NPCS[npc];
  const rel = s.relations.find((r) => r.npc === npc)!;
  const opt = (label: string, fn: () => void, disabled = false) => {
    const b = h('button', { class: 'btn small', type: 'button', disabled }, label);
    b.addEventListener('click', fn);
    el.append(b);
  };
  if (def.shop)
    opt(def.shop === 'substation' ? 'Power upgrades' : 'Shop', () => {
      m.close();
      openShop(def.shop!);
    });
  if (npc === 'bo')
    opt(
      s.farm.daily.minigamePlayed ? 'Coffee Rush (tomorrow)' : 'Help out: Coffee Rush',
      () => {
        m.close();
        openCoffeeRush();
      },
      s.farm.daily.minigamePlayed,
    );
  const gifts = s.inventory
    .map((i) => getItem(i.itemId)!)
    .filter((it) => it && (it.type === 'gift' || it.type === 'food'));
  opt(
    rel.giftedToday ? 'Gift (tomorrow)' : 'Give a gift',
    () =>
      pickItem(`Give ${def.name} a gift`, gifts, async (it) => {
        await store.act({ type: 'gift', npc, itemId: it.id });
        renderOptions(npc, el, m, text);
      }),
    rel.giftedToday || gifts.length === 0,
  );

  // quest deliveries for this NPC
  for (const q of s.quests.filter((x) => x.state === 'active')) {
    const def2 = findQuest(q.questId, s.farm.id);
    const deliver = def2?.goals.filter((g) => g.type === 'deliver' && g.npc === npc) ?? [];
    if (!deliver.length) continue;
    const canGive = deliver.some((g) => g.type === 'deliver' && store.qty(g.itemId) > 0);
    opt(
      `Deliver: ${def2!.title}`,
      async () => {
        await store.act({ type: 'deliver', questId: q.questId, npc });
        renderOptions(npc, el, m, text);
      },
      !canGive,
    );
  }
  if (npc === 'kai' && s.festival && rel.level >= 2) {
    opt(
      s.farm.daily.raceDone ? 'Raced today' : 'Speed race!',
      async () => {
        await store.act({ type: 'speed_race' });
        renderOptions(npc, el, m, text);
      },
      s.farm.daily.raceDone,
    );
  }
  const bye = h('button', { class: 'btn small primary', type: 'button' }, 'Bye');
  bye.addEventListener('click', () => m.close());
  el.append(bye);
}

export function openFriends(): void {
  const s = store.state!;
  const rows = s.relations.map((r) => {
    const def = NPCS[r.npc];
    const lvl = friendshipLevel(r.points);
    const into = r.points - lvl * FRIENDSHIP_PER_LEVEL;
    const hearts = h(
      'div',
      { class: 'row', style: 'gap:2px' },
      ...Array.from({ length: 5 }, (_, i) =>
        h('span', { style: { opacity: i < lvl ? '1' : '0.25' } }, icon(ICONS.heart, 16)),
      ),
    );
    const perks = Object.entries(def.perks).map(([l, p]) =>
      h(
        'li',
        { style: { color: Number(l) <= lvl ? 'var(--green)' : 'var(--metal-3)' } },
        `Lv ${l}: ${p}`,
      ),
    );
    return h(
      'div',
      { class: 'list-item', style: 'align-items:flex-start' },
      portrait(r.npc),
      h(
        'div',
        { class: 'grow col', style: 'gap:4px' },
        h('div', { class: 'spread' }, h('b', { style: 'font-size:20px' }, def.name), hearts),
        h('span', { class: 'dim' }, def.role),
        lvl < 5
          ? h(
              'span',
              { style: 'font-size:15px' },
              `${into} / ${FRIENDSHIP_PER_LEVEL} to next level · ${r.talkedToday ? 'Chatted today' : 'Say hi today!'}`,
            )
          : h('span', { class: 'good', style: 'font-size:15px' }, 'Best friends!'),
        h('ul', { style: 'margin:0;padding-left:18px;font-size:15px' }, ...perks),
        h(
          'span',
          { class: 'dim', style: 'font-size:15px' },
          `Loves: ${def.loves.map((i) => getItem(i)?.name).join(', ')} · Likes: ${def.likes.map((i) => getItem(i)?.name).join(', ')}`,
        ),
      ),
    );
  });
  showModal(
    'Friends',
    [
      h(
        'p',
        { class: 'dim' },
        'Chat every day, bring gifts and help with quests. Every level unlocks something.',
      ),
      ...rows,
    ],
    { wide: true, key: 'friends' },
  );
}
