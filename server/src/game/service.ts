/**
 * Game service: farm creation, state reads and serialized action processing.
 * Every mutation runs inside one DB transaction with the farm row locked.
 */
import {
  DAY_START_MINUTE,
  MAX_ENERGY,
  NPC_IDS,
  STARTING_COINS,
  TUTORIAL_SLOT,
  calendar,
  newRig,
  rollWeather,
  seeded,
  validateCharacterName,
  validateFarmName,
  type ActionResponse,
  type CreateFarmRequest,
  type GameAction,
  type GameEvent,
  type StateDTO,
} from '@rig-valley/shared';
import type { Db, Queryable } from '../db/index.js';
import type { ConfigStore } from '../configStore.js';
import type { PriceFeed } from '../rewards/price.js';
import { fail, GameError } from '../errors.js';
import { applyAction, advanceTutorial } from './actions.js';
import { advanceClock } from './clock.js';
import { toStateDTO } from './dto.js';
import type { EngineCtx } from './helpers.js';
import { addQuest, pickDailyQuest, refreshQuests, rewardText } from './quests.js';
import {
  defaultFlags,
  findFarmId,
  loadState,
  nextRigId,
  saveState,
  type FarmState,
} from './state.js';

export interface GameServiceDeps {
  db: Db;
  config: ConfigStore;
  price: PriceFeed;
  decimals: number;
  symbol: string;
  rewardsEnabled: () => boolean;
  now?: () => number;
}

/** In-process per-farm mutex so concurrent requests queue instead of deadlocking. */
class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

export class GameService {
  private mutex = new KeyedMutex();
  constructor(private deps: GameServiceDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  async farmIdFor(address: string): Promise<number | null> {
    return findFarmId(this.deps.db, address);
  }

  async isNameAvailable(name: string): Promise<boolean> {
    const r = await this.deps.db.query('SELECT 1 FROM farms WHERE farm_name_key = $1', [
      nameKey(name),
    ]);
    return r.rows.length === 0;
  }

  async createFarm(address: string, req: CreateFarmRequest): Promise<StateDTO> {
    const addr = address.toLowerCase();
    const nameErr = validateFarmName(req.farmName) ?? validateCharacterName(req.character.name);
    if (nameErr) fail('invalid_name', nameErr);
    const farmName = req.farmName.trim().replace(/\s+/g, ' ');
    const character = {
      name: req.character.name.trim(),
      hair: req.character.hair,
      hat: req.character.hat,
    };

    return this.mutex.run(addr, async () => {
      try {
        const farmId = await this.deps.db.transaction(async (tx) => {
          // One wallet = one farm, ever (MASTERPLAN §1.5). Enforced by UNIQUE(wallet_address).
          if (await findFarmId(tx, addr))
            fail('farm_exists', 'This wallet already has a farm.', 409);
          const day = 1;
          const ins = await tx.query<{ id: number }>(
            `INSERT INTO farms (wallet_address, farm_name, farm_name_key, character, energy, coins, day, minute, weather, weather_tomorrow, flags)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sunny','sunny',$9) RETURNING id`,
            [
              addr,
              farmName,
              nameKey(farmName),
              JSON.stringify(character),
              MAX_ENERGY,
              STARTING_COINS,
              day,
              DAY_START_MINUTE,
              JSON.stringify(defaultFlags(day, character.hat)),
            ],
          );
          const id = Number(ins.rows[0]!.id);
          const s = await loadState(tx, id);
          s.farm.weatherTomorrow = rollWeather(calendar(2).season, seeded('weather', id, 2));
          s.ledger.push({ delta: STARTING_COINS, reason: 'starting_coins' });
          // Uncle Ray's old rig: a dusty frame waiting for a CPU.
          const rig = newRig(await nextRigId(tx), TUTORIAL_SLOT.x, TUTORIAL_SLOT.y, 'frame_t1');
          rig.dust = 40;
          rig.paste = 70;
          rig.condition = 80;
          rig.tutorial = true;
          s.rigs.push(rig);
          for (const n of NPC_IDS) s.relations.set(n, 0);
          addQuest(s, 'main_first_harvest');
          const daily = pickDailyQuest(s);
          addQuest(s, daily.id);
          s.newMail.push({ templateId: 'ray_welcome', params: {} });
          s.newMail.push({
            templateId: 'daily_quest',
            params: {
              title: daily.title,
              description: daily.description,
              reward: rewardText(daily.reward),
            },
          });
          await saveState(tx, s);
          return id;
        });
        return this.getState(farmId);
      } catch (e) {
        if (e instanceof GameError) throw e;
        const msg = (e as Error).message ?? '';
        if (msg.includes('farm_name_key'))
          fail('name_taken', 'That farm name is taken. Try another one.', 409);
        if (msg.includes('wallet_address'))
          fail('farm_exists', 'This wallet already has a farm.', 409);
        throw e;
      }
    });
  }

  /** Config and price are fetched before the transaction so no network I/O happens while rows are locked. */
  private async engineCtx(events: GameEvent[]): Promise<Omit<EngineCtx, 'q'>> {
    const [config, quote] = await Promise.all([this.deps.config.get(), this.deps.price.get()]);
    return {
      now: this.now(),
      config,
      price: async () => quote,
      decimals: this.deps.decimals,
      events,
    };
  }

  private async dto(s: FarmState): Promise<StateDTO> {
    return toStateDTO(s, {
      config: await this.deps.config.get(),
      price: await this.deps.price.get(),
      decimals: this.deps.decimals,
      symbol: this.deps.symbol,
      rewardsEnabled: this.deps.rewardsEnabled(),
      now: this.now(),
    });
  }

  async getState(farmId: number): Promise<StateDTO> {
    const s = await loadState(this.deps.db, farmId, false);
    return this.dto(s);
  }

  /** Run a mutation on a farm: lock, advance the clock, apply, save. */
  async withFarm<T>(
    farmId: number,
    fn: (s: FarmState, ctx: EngineCtx, tx: Queryable) => Promise<T>,
    opts: { advance?: boolean } = {},
  ): Promise<{ result: T; state: StateDTO; events: GameEvent[] }> {
    return this.mutex.run(`farm:${farmId}`, async () => {
      const events: GameEvent[] = [];
      let saved!: FarmState;
      const base = await this.engineCtx(events);
      const result = await this.deps.db.transaction(async (tx) => {
        const s = await loadState(tx, farmId);
        const ctx: EngineCtx = { ...base, q: tx };
        if (opts.advance !== false) advanceClock(s, ctx);
        const out = await fn(s, ctx, tx);
        advanceTutorial(s);
        refreshQuests(s, ctx);
        await saveState(tx, s);
        saved = s;
        return out;
      });
      return { result, state: await this.dto(saved), events };
    });
  }

  /** Heartbeat from the client while playing. `paused` = a menu is open. */
  async tick(farmId: number, paused: boolean): Promise<ActionResponse> {
    const { state, events } = await this.withFarm(farmId, async (s) => {
      s.farm.paused = paused;
    });
    return { state, events };
  }

  async act(farmId: number, action: GameAction): Promise<ActionResponse> {
    const { state, events } = await this.withFarm(farmId, async (s, ctx) => {
      await applyAction(s, ctx, action);
    });
    return { state, events };
  }
}

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
