/** World interactions: sleeping, stage gates, the festival, the inherited box. */
import {
  FESTIVALS,
  SEASON_NAMES,
  STAGES,
  WEATHER_INFO,
  calendar,
  findQuest,
  formatClock,
  formatInt,
  getItem,
  isRigActive,
  type SleepSummary,
} from '@rig-valley/shared';
import { store } from '../../store';
import { sfx } from '../../audio';
import { ICONS, h, icon } from '../dom';
import { confirmModal, openModal, showModal } from '../modal';
import { pickItem } from './rig';

export async function openSleep(): Promise<void> {
  const minute = store.displayMinute();
  const late = minute >= 24 * 60;
  const ok = await confirmModal(
    'Go to bed?',
    `It's ${formatClock(minute)}. ${late ? 'Sleeping after midnight only refills part of your Energy.' : 'You will wake up at 6:00 AM with full Energy.'}\nYour rigs keep working overnight.`,
    'Sleep',
    'Not yet',
  );
  if (!ok) return;
  sfx('door');
  await store.act({ type: 'sleep' });
}

export function showMorning(s: SleepSummary): void {
  sfx('sleep');
  const cal = calendar(s.day);
  const lines: HTMLElement[] = [];
  if (s.passedOut)
    lines.push(
      h(
        'p',
        { class: 'bad' },
        `You passed out at 2:00 AM! Bo found you and dragged you home (${s.fee} Coins). Energy: ${s.energy}.`,
      ),
    );
  lines.push(h('p', null, `Energy restored to ${s.energy}.`));
  if (s.readyRigs)
    lines.push(
      h(
        'p',
        { class: 'gold-text' },
        `${s.readyRigs} rig${s.readyRigs > 1 ? 's are' : ' is'} ready to claim!`,
      ),
    );
  if (s.tripped)
    lines.push(
      h(
        'p',
        { class: 'bad' },
        'The breaker tripped last night — too much Power draw. Rigs stopped until morning.',
      ),
    );
  if (s.outage)
    lines.push(h('p', { class: 'warn' }, 'A power outage hit last night. Rigs took a nap.'));
  if (s.bill !== null)
    lines.push(h('p', null, `Weekly power bill paid: ${formatInt(s.bill)} Coins.`));
  lines.push(
    h('p', null, `Today: ${WEATHER_INFO[s.weather].name} — ${WEATHER_INFO[s.weather].effect}`),
    h('p', { class: 'dim' }, WEATHER_INFO[s.forecast].forecast),
  );
  lines.push(h('p', { class: 'dim' }, "Check your mailbox for today's letters."));
  const go = h('button', { class: 'btn primary big', type: 'button' }, 'Start the day');
  const panel = h(
    'div',
    { class: 'panel modal narrow', style: 'align-items:center;text-align:center' },
    h('span', { class: 'label' }, `${SEASON_NAMES[cal.season]} · Year ${cal.year}`),
    h('h2', { style: 'font-size:34px' }, `${cal.weekday}, Day ${cal.dayOfSeason}`),
    h(
      'div',
      { class: 'hero-icon' },
      icon(ICONS[s.weather as keyof typeof ICONS] ?? ICONS.sunny, 32),
    ),
    ...lines,
    go,
  );
  const m = openModal(panel, { closable: false });
  go.addEventListener('click', () => m.close());
}

export function openGate(stage: number): void {
  const s = store.state!;
  const def = STAGES.find((x) => x.stage === stage)!;
  if (s.farm.stage >= stage) {
    showModal(
      def.name,
      h(
        'div',
        { class: 'col' },
        h('p', null, def.description),
        h('p', { class: 'good' }, 'Unlocked! Build rigs on the empty slots.'),
      ),
      { narrow: true },
    );
    return;
  }
  const active = s.rigs.filter(isRigActive).length;
  const questOk = !def.quest || s.quests.some((q) => q.questId === def.quest && q.state === 'done');
  const keyOk = !def.keyItem || store.qty(def.keyItem) > 0;
  const prevOk = s.farm.stage === stage - 1;
  const req = (ok: boolean, text: string) =>
    h(
      'div',
      { class: 'row', style: 'gap:8px' },
      h('span', { style: { color: ok ? 'var(--green)' : 'var(--red)' } }, ok ? '✔' : '✖'),
      h('span', null, text),
    );
  const items = [
    !prevOk ? req(false, `Unlock ${STAGES[stage - 2]?.name} first`) : null,
    def.quest
      ? req(questOk, `Finish the story quest "${findQuest(def.quest, s.farm.id)?.title}"`)
      : null,
    req(active >= def.activeRigs, `${def.activeRigs} rigs running at once (you have ${active})`),
    def.keyItem ? req(keyOk, `Own a ${getItem(def.keyItem)?.name}`) : null,
    req(
      s.farm.coins >= def.cost,
      `${formatInt(def.cost)} Coins (you have ${formatInt(s.farm.coins)})`,
    ),
  ].filter(Boolean) as HTMLElement[];
  const all = prevOk && questOk && keyOk && active >= def.activeRigs && s.farm.coins >= def.cost;
  const unlock = h(
    'button',
    { class: 'btn primary', type: 'button', disabled: !all },
    `Unlock for ${formatInt(def.cost)} Coins`,
  );
  const m = showModal(
    def.name,
    h(
      'div',
      { class: 'col' },
      h('p', null, def.description),
      h('p', { class: 'dim' }, `Unlocks: ${def.unlocks.join(', ')}. Up to ${def.maxRigs} rigs.`),
      ...items,
      h('div', { class: 'row' }, unlock),
    ),
    { narrow: false },
  );
  unlock.addEventListener('click', async () => {
    if (await store.act({ type: 'unlock_stage', stage })) m.close();
  });
}

export function openFestival(): void {
  const s = store.state!;
  if (!s.festival) return;
  const def = FESTIVALS[calendar(s.farm.day).season];
  const join = h(
    'button',
    { class: 'btn primary', type: 'button', disabled: s.farm.daily.festivalJoined },
    s.farm.daily.festivalJoined ? 'Joined today' : 'Join',
  );
  const m = showModal(
    def.name,
    h(
      'div',
      { class: 'col' },
      h('p', null, def.description),
      h(
        'p',
        { class: 'dim' },
        `Prize: ${getItem(def.prize)?.name}. Festival prizes are items and decorations only.`,
      ),
      h('div', { class: 'row' }, join),
    ),
    { narrow: true },
  );
  join.addEventListener('click', async () => {
    if (def.id === 'winter_glow') {
      const gifts = s.inventory.map((i) => getItem(i.itemId)!).filter((it) => it?.type === 'gift');
      m.close();
      pickItem(
        'Pick a gift for the swap',
        gifts,
        (it) => void store.act({ type: 'festival_join', giftItemId: it.id }),
      );
      return;
    }
    if (await store.act({ type: 'festival_join' })) m.close();
  });
}

export async function openBox(): Promise<void> {
  const s = store.state!;
  if (s.farm.boxOpened) {
    showModal(
      "Uncle Ray's box",
      h('p', null, 'Empty. Just a few cat hairs and a note that says "back soon (maybe)".'),
      { narrow: true },
    );
    return;
  }
  sfx('build');
  await store.act({ type: 'open_box' });
}

export function openStatue(): void {
  showModal(
    'The Coin Statue',
    h(
      'p',
      null,
      "A hologram of the very first coin ever mined in the valley. Locals say Uncle Ray built it at 3 AM 'for vibes'.",
    ),
    { narrow: true },
  );
}
