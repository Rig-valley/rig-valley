/**
 * Loading and saving a farm's full state. The engine mutates an in-memory
 * FarmState inside a transaction; `saveState` writes back only what changed.
 */
import {
  calendar,
  getItem,
  isCoolingUnit,
  isFrame,
  NPC_IDS,
  rigStatus,
  type CharacterDTO,
  type CoolingUnitData,
  type DecorDTO,
  type HatId,
  type NpcId,
  type RigData,
  type RigPaint,
  type Weather,
} from '@rig-valley/shared';
import type { Queryable } from '../db/index.js';
import { fail } from '../errors.js';

export interface DailyFlags {
  day: number;
  talked: NpcId[];
  gifted: NpcId[];
  minigame: boolean;
  festival: boolean;
  race: boolean;
  freeCoffee: boolean;
  harvests: number;
  /** Scrap spots already searched today (missing on saves from before scraps existed). */
  scavenged?: number[];
  /** Today's Coffee Rush shift: the seed its orders come from and when it started (real ms). */
  rush?: { seed: number; startedAt: number; done: boolean };
}

export interface FarmFlags {
  daily: DailyFlags;
  ownedHats: HatId[];
  boxOpened: boolean;
  tutorialSlept: boolean;
  perksGranted: string[];
  billDebt: number;
  rareRestockDay: number;
  raceWon: boolean;
  /** Harvests yesterday, for the morning summary. */
  harvestsYesterday: number;
  /** Power bills in a row that couldn't be paid in full. Two = Vera cuts the power. */
  unpaidBills: number;
  /** Power is cut over unpaid bills: rigs can't be switched on until the debt is paid. */
  powerCut: boolean;
  /** UTC day (see rewardDay) and how many harvests paid NVDA on it. */
  nvdaDay: string;
  nvdaHarvests: number;
  /** Harvests past the daily NVDA limit (Coins only). They don't use up the beginner boost. */
  coinOnlyHarvests: number;
}

export interface FarmRow {
  id: number;
  address: string;
  farmName: string;
  character: CharacterDTO;
  stage: number;
  energy: number;
  coins: number;
  day: number;
  minute: number;
  paused: boolean;
  lastTickAt: number | null;
  weather: Weather;
  weatherTomorrow: Weather;
  powerUpgrades: string[];
  powerKwh: number;
  tutorialStep: number;
  harvestCount: number;
  /** When the farm was created (real ms). */
  createdAt: number;
  flags: FarmFlags;
}

export interface QuestRow {
  questId: string;
  state: 'active' | 'done';
  progress: number[];
  createdDay: number;
}

export interface MailRow {
  id: number;
  day: number;
  templateId: string;
  params: Record<string, string | number>;
  read: boolean;
}

export interface LedgerEntry {
  delta: number;
  reason: string;
}

export interface HarvestEntry {
  rigId: number;
  coins: number;
  usd: number;
  nvdaUnits: bigint;
  priceUsed: number | null;
  boosted: boolean;
}

export interface FarmState {
  farm: FarmRow;
  rigs: RigData[];
  coolingUnits: CoolingUnitData[];
  decor: DecorDTO[];
  inventory: Map<string, number>;
  relations: Map<NpcId, number>;
  quests: QuestRow[];
  mail: MailRow[];
  pendingUnits: bigint;
  backlogUsd: number;
  // Append-only outputs written on save.
  newMail: { templateId: string; params: Record<string, string | number> }[];
  deletedMail: number[];
  ledger: LedgerEntry[];
  harvests: HarvestEntry[];
  /** Snapshots for diffing. */
  _orig: Snapshot;
}

interface Snapshot {
  farm: string;
  rigs: Map<number, string>;
  cooling: Map<string, string>;
  decor: Map<string, string>;
  inventory: Map<string, number>;
  relations: Map<string, number>;
  quests: Map<string, string>;
  mail: Map<number, boolean>;
  pending: string;
}

export function defaultDaily(day: number): DailyFlags {
  return {
    day,
    talked: [],
    gifted: [],
    minigame: false,
    festival: false,
    race: false,
    freeCoffee: false,
    harvests: 0,
    scavenged: [],
  };
}

export function defaultFlags(day: number, hat: HatId): FarmFlags {
  return {
    daily: defaultDaily(day),
    ownedHats: hat === 'none' ? ['none'] : ['none', hat],
    boxOpened: false,
    tutorialSlept: false,
    perksGranted: [],
    billDebt: 0,
    rareRestockDay: 0,
    raceWon: false,
    harvestsYesterday: 0,
    unpaidBills: 0,
    powerCut: false,
    nvdaDay: '',
    nvdaHarvests: 0,
    coinOnlyHarvests: 0,
  };
}

const key = (x: number, y: number) => `${x},${y}`;

interface FarmDbRow {
  id: number;
  wallet_address: string;
  farm_name: string;
  character: CharacterDTO;
  stage: number;
  energy: number;
  coins: number;
  day: number;
  minute: number;
  paused: boolean;
  last_tick_at: Date | string | null;
  weather: Weather;
  weather_tomorrow: Weather;
  power_upgrades: string[];
  power_kwh: number;
  tutorial_step: number;
  harvest_count: number;
  flags: FarmFlags;
  created_at: Date | string;
}

export async function findFarmId(q: Queryable, address: string): Promise<number | null> {
  const r = await q.query<{ id: number }>('SELECT id FROM farms WHERE wallet_address = $1', [
    address.toLowerCase(),
  ]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

export async function loadState(q: Queryable, farmId: number, lock = true): Promise<FarmState> {
  const fr = await q.query<FarmDbRow>(
    `SELECT * FROM farms WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [farmId],
  );
  const f = fr.rows[0];
  if (!f) fail('no_farm', "We couldn't find your farm.", 404);

  // One query at a time: inside a transaction they share a single connection (pg refuses
  // concurrent queries on one client).
  const [rigs, cooling, decor, inv, rel, quests, mail, pending] = await inSequence([
    () =>
      q.query<Record<string, unknown>>('SELECT * FROM rigs WHERE farm_id = $1 ORDER BY id', [
        farmId,
      ]),
    () =>
      q.query<{ tile_x: number; tile_y: number; item_id: string }>(
        'SELECT * FROM cooling_units WHERE farm_id = $1',
        [farmId],
      ),
    () =>
      q.query<{ tile_x: number; tile_y: number; item_id: string }>(
        'SELECT * FROM decor WHERE farm_id = $1',
        [farmId],
      ),
    () =>
      q.query<{ item_id: string; qty: number }>(
        'SELECT item_id, qty FROM inventory WHERE farm_id = $1',
        [farmId],
      ),
    () =>
      q.query<{ npc_id: NpcId; points: number }>(
        'SELECT npc_id, points FROM npc_relations WHERE farm_id = $1',
        [farmId],
      ),
    () =>
      q.query<{
        quest_id: string;
        state: 'active' | 'done';
        progress: number[];
        created_day: number;
      }>('SELECT * FROM quests WHERE farm_id = $1', [farmId]),
    () =>
      q.query<{
        id: number;
        day: number;
        template_id: string;
        params: Record<string, string | number>;
        read: boolean;
      }>(
        'SELECT id, day, template_id, params, read FROM mail WHERE farm_id = $1 ORDER BY id DESC LIMIT 60',
        [farmId],
      ),
    () =>
      q.query<{ amount: string; usd_backlog: string }>(
        'SELECT amount::text AS amount, usd_backlog::text AS usd_backlog FROM nvda_pending WHERE farm_id = $1',
        [farmId],
      ),
  ]);

  const farm: FarmRow = {
    id: Number(f.id),
    address: f.wallet_address,
    farmName: f.farm_name,
    character: f.character,
    stage: Number(f.stage),
    energy: Number(f.energy),
    coins: Number(f.coins),
    day: Number(f.day),
    minute: Number(f.minute),
    paused: !!f.paused,
    lastTickAt: f.last_tick_at ? new Date(f.last_tick_at).getTime() : null,
    weather: f.weather,
    weatherTomorrow: f.weather_tomorrow,
    powerUpgrades: f.power_upgrades ?? [],
    powerKwh: Number(f.power_kwh),
    tutorialStep: Number(f.tutorial_step),
    harvestCount: Number(f.harvest_count),
    createdAt: new Date(f.created_at).getTime(),
    flags: { ...defaultFlags(Number(f.day), 'none'), ...(f.flags ?? {}) },
  };

  const state: FarmState = {
    farm,
    rigs: rigs.rows.map(rowToRig),
    coolingUnits: cooling.rows.map((r) => ({
      x: Number(r.tile_x),
      y: Number(r.tile_y),
      itemId: r.item_id,
    })),
    decor: decor.rows.map((r) => ({ x: Number(r.tile_x), y: Number(r.tile_y), itemId: r.item_id })),
    inventory: new Map(
      inv.rows.filter((r) => Number(r.qty) > 0).map((r) => [r.item_id, Number(r.qty)]),
    ),
    relations: new Map(NPC_IDS.map((n) => [n, 0])),
    quests: quests.rows.map((r) => ({
      questId: r.quest_id,
      state: r.state,
      progress: r.progress ?? [],
      createdDay: Number(r.created_day),
    })),
    mail: mail.rows.map((r) => ({
      id: Number(r.id),
      day: Number(r.day),
      templateId: r.template_id,
      params: r.params,
      read: r.read,
    })),
    pendingUnits: BigInt(pending.rows[0]?.amount ?? '0'),
    backlogUsd: Number(pending.rows[0]?.usd_backlog ?? '0'),
    newMail: [],
    deletedMail: [],
    ledger: [],
    harvests: [],
    _orig: undefined as unknown as Snapshot,
  };
  for (const r of rel.rows) state.relations.set(r.npc_id, Number(r.points));
  state._orig = snapshot(state);
  return state;
}

function rowToRig(r: Record<string, unknown>): RigData {
  return {
    id: Number(r.id),
    x: Number(r.tile_x),
    y: Number(r.tile_y),
    frameId: String(r.frame_id),
    cpuId: (r.cpu_id as string) ?? null,
    coolerId: (r.cooler_id as string) ?? null,
    psuId: (r.psu_id as string) ?? null,
    condition: Number(r.condition),
    dust: Number(r.dust),
    paste: Number(r.paste),
    temp: Number(r.temp),
    progress: Number(r.cycle_progress),
    powered: !!r.powered,
    bootRemaining: Number(r.boot_remaining),
    overheat: !!r.overheat,
    paint: (r.paint as RigPaint) ?? 'steel',
    tutorial: !!r.tutorial,
  };
}

function farmJson(f: FarmRow): string {
  return JSON.stringify(f);
}

function snapshot(s: FarmState): Snapshot {
  return {
    farm: farmJson(s.farm),
    rigs: new Map(s.rigs.map((r) => [r.id, JSON.stringify(r)])),
    cooling: new Map(s.coolingUnits.map((c) => [key(c.x, c.y), c.itemId])),
    decor: new Map(s.decor.map((c) => [key(c.x, c.y), c.itemId])),
    inventory: new Map(s.inventory),
    relations: new Map(s.relations),
    quests: new Map(s.quests.map((q) => [q.questId, JSON.stringify(q)])),
    mail: new Map(s.mail.map((m) => [m.id, m.read])),
    pending: `${s.pendingUnits}|${s.backlogUsd}`,
  };
}

/** Persist everything that changed since load. */
export async function saveState(q: Queryable, s: FarmState): Promise<void> {
  const o = s._orig;
  const fid = s.farm.id;
  const f = s.farm;

  if (farmJson(f) !== o.farm) {
    await q.query(
      `UPDATE farms SET stage=$2, energy=$3, coins=$4, day=$5, minute=$6, season=$7, paused=$8, last_tick_at=$9,
        weather=$10, weather_tomorrow=$11, power_upgrades=$12, power_kwh=$13, tutorial_step=$14, harvest_count=$15,
        flags=$16, character=$17, updated_at=now() WHERE id=$1`,
      [
        fid,
        f.stage,
        Math.round(f.energy),
        Math.round(f.coins),
        f.day,
        f.minute,
        calendar(f.day).season,
        f.paused,
        f.lastTickAt ? new Date(f.lastTickAt).toISOString() : null,
        f.weather,
        f.weatherTomorrow,
        JSON.stringify(f.powerUpgrades),
        f.powerKwh,
        f.tutorialStep,
        f.harvestCount,
        JSON.stringify(f.flags),
        JSON.stringify(f.character),
      ],
    );
  }

  // Rigs
  const liveRigIds = new Set(s.rigs.map((r) => r.id));
  for (const id of o.rigs.keys()) {
    if (!liveRigIds.has(id))
      await q.query('DELETE FROM rigs WHERE farm_id=$1 AND id=$2', [fid, id]);
  }
  for (const r of s.rigs) {
    const json = JSON.stringify(r);
    if (o.rigs.get(r.id) === json) continue;
    const frame = getItem(r.frameId);
    const tier = isFrame(frame) ? frame.tier : 1;
    const params = [
      fid,
      r.x,
      r.y,
      tier,
      r.frameId,
      r.cpuId,
      r.coolerId,
      r.psuId,
      r.condition,
      r.dust,
      r.paste,
      r.temp,
      r.progress,
      rigStatus(r),
      r.powered,
      r.bootRemaining,
      r.overheat,
      r.paint,
      r.tutorial,
    ];
    if (o.rigs.has(r.id)) {
      await q.query(
        `UPDATE rigs SET tile_x=$3, tile_y=$4, rig_tier=$5, frame_id=$6, cpu_id=$7, cooler_id=$8, psu_id=$9, condition=$10,
          dust=$11, paste=$12, temp=$13, cycle_progress=$14, state=$15, powered=$16, boot_remaining=$17, overheat=$18,
          paint=$19, tutorial=$20 WHERE farm_id=$1 AND id=$2`,
        [fid, r.id, ...params.slice(1)],
      );
    } else {
      await q.query(
        `INSERT INTO rigs (id, farm_id, tile_x, tile_y, rig_tier, frame_id, cpu_id, cooler_id, psu_id, condition, dust, paste,
          temp, cycle_progress, state, powered, boot_remaining, overheat, paint, tutorial)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [r.id, ...params],
      );
    }
  }

  // Cooling units & decor
  await syncTiles(q, 'cooling_units', fid, o.cooling, s.coolingUnits, true);
  await syncTiles(q, 'decor', fid, o.decor, s.decor, false);

  // Inventory
  const invKeys = new Set([...o.inventory.keys(), ...s.inventory.keys()]);
  for (const itemId of invKeys) {
    const now = s.inventory.get(itemId) ?? 0;
    if ((o.inventory.get(itemId) ?? 0) === now) continue;
    if (now <= 0)
      await q.query('DELETE FROM inventory WHERE farm_id=$1 AND item_id=$2', [fid, itemId]);
    else
      await q.query(
        `INSERT INTO inventory (farm_id, item_id, qty) VALUES ($1,$2,$3)
         ON CONFLICT (farm_id, item_id) DO UPDATE SET qty = EXCLUDED.qty`,
        [fid, itemId, now],
      );
  }

  // Relations
  for (const [npc, points] of s.relations) {
    if (o.relations.get(npc) === points) continue;
    await q.query(
      `INSERT INTO npc_relations (farm_id, npc_id, points, level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (farm_id, npc_id) DO UPDATE SET points = EXCLUDED.points, level = EXCLUDED.level`,
      [fid, npc, points, Math.min(5, Math.floor(points / 100))],
    );
  }

  // Quests
  const liveQuests = new Set(s.quests.map((x) => x.questId));
  for (const id of o.quests.keys()) {
    if (!liveQuests.has(id))
      await q.query('DELETE FROM quests WHERE farm_id=$1 AND quest_id=$2', [fid, id]);
  }
  for (const qr of s.quests) {
    if (o.quests.get(qr.questId) === JSON.stringify(qr)) continue;
    await q.query(
      `INSERT INTO quests (farm_id, quest_id, state, progress, created_day) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (farm_id, quest_id) DO UPDATE SET state = EXCLUDED.state, progress = EXCLUDED.progress`,
      [fid, qr.questId, qr.state, JSON.stringify(qr.progress), qr.createdDay],
    );
  }

  // Mail
  for (const m of s.mail) {
    if (o.mail.has(m.id) && o.mail.get(m.id) !== m.read) {
      await q.query('UPDATE mail SET read=$3 WHERE farm_id=$1 AND id=$2', [fid, m.id, m.read]);
    }
  }
  for (const id of s.deletedMail)
    await q.query('DELETE FROM mail WHERE farm_id=$1 AND id=$2', [fid, id]);
  for (const m of s.newMail) {
    const r = await q.query<{ id: number }>(
      'INSERT INTO mail (farm_id, day, template_id, params) VALUES ($1,$2,$3,$4) RETURNING id',
      [fid, s.farm.day, m.templateId, JSON.stringify(m.params)],
    );
    s.mail.unshift({
      id: Number(r.rows[0]!.id),
      day: s.farm.day,
      templateId: m.templateId,
      params: m.params,
      read: false,
    });
  }
  s.newMail = [];
  s.deletedMail = [];

  // Pending NVDA
  if (`${s.pendingUnits}|${s.backlogUsd}` !== o.pending) {
    await q.query(
      `INSERT INTO nvda_pending (farm_id, amount, usd_backlog) VALUES ($1, $2::numeric, $3)
       ON CONFLICT (farm_id) DO UPDATE SET amount = EXCLUDED.amount, usd_backlog = EXCLUDED.usd_backlog`,
      [fid, s.pendingUnits.toString(), s.backlogUsd.toFixed(6)],
    );
  }

  for (const l of s.ledger) {
    await q.query('INSERT INTO coins_ledger (farm_id, delta, reason) VALUES ($1,$2,$3)', [
      fid,
      Math.round(l.delta),
      l.reason,
    ]);
  }
  s.ledger = [];
  for (const h of s.harvests) {
    await q.query(
      `INSERT INTO harvests (farm_id, rig_id, game_day, coins, usd_value, nvda_amount, price_used, boosted)
       VALUES ($1,$2,$3,$4,$5,$6::numeric,$7,$8)`,
      [
        fid,
        h.rigId,
        s.farm.day,
        h.coins,
        h.usd.toFixed(6),
        h.nvdaUnits.toString(),
        h.priceUsed,
        h.boosted,
      ],
    );
  }
  s.harvests = [];
  s._orig = snapshot(s);
}

async function syncTiles(
  q: Queryable,
  table: 'cooling_units' | 'decor',
  fid: number,
  orig: Map<string, string>,
  now: { x: number; y: number; itemId: string }[],
  withLevel: boolean,
): Promise<void> {
  const live = new Map(now.map((t) => [key(t.x, t.y), t]));
  for (const k of orig.keys()) {
    if (live.has(k) && live.get(k)!.itemId === orig.get(k)) continue;
    const [x, y] = k.split(',').map(Number);
    await q.query(`DELETE FROM ${table} WHERE farm_id=$1 AND tile_x=$2 AND tile_y=$3`, [fid, x, y]);
  }
  for (const [k, t] of live) {
    if (orig.get(k) === t.itemId) continue;
    if (withLevel) {
      const item = getItem(t.itemId);
      const level = isCoolingUnit(item) ? item.level : 1;
      await q.query(
        'INSERT INTO cooling_units (farm_id, tile_x, tile_y, level, item_id) VALUES ($1,$2,$3,$4,$5)',
        [fid, t.x, t.y, level, t.itemId],
      );
    } else {
      await q.query('INSERT INTO decor (farm_id, tile_x, tile_y, item_id) VALUES ($1,$2,$3,$4)', [
        fid,
        t.x,
        t.y,
        t.itemId,
      ]);
    }
  }
}

export async function nextRigId(q: Queryable): Promise<number> {
  const r = await q.query<{ id: string | number | bigint }>(
    "SELECT nextval(pg_get_serial_sequence('rigs','id')) AS id",
  );
  return Number(r.rows[0]!.id);
}

/** Runs query thunks one after another, keeping each result's type. */
async function inSequence<T extends unknown[]>(
  fns: [...{ [K in keyof T]: () => Promise<T[K]> }],
): Promise<T> {
  const out: unknown[] = [];
  for (const fn of fns) out.push(await (fn as () => Promise<unknown>)());
  return out as T;
}
