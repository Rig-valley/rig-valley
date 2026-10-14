/**
 * Client-side game store. The server is authoritative: the client only keeps
 * the latest StateDTO, interpolates the clock for display, and sends ticks.
 */
import {
  DAY_END_MINUTE,
  REAL_MS_PER_GAME_MINUTE,
  TICK_INTERVAL_MS,
  type ActionResponse,
  type GameAction,
  type GameEvent,
  type StateDTO,
} from '@rig-valley/shared';
import { api, ApiError } from './api';

type Listener<T> = (v: T) => void;

class Emitter<M extends Record<string, unknown>> {
  private l = new Map<keyof M, Set<Listener<never>>>();
  on<K extends keyof M>(k: K, fn: Listener<M[K]>): () => void {
    if (!this.l.has(k)) this.l.set(k, new Set());
    this.l.get(k)!.add(fn as Listener<never>);
    return () => this.l.get(k)!.delete(fn as Listener<never>);
  }
  emit<K extends keyof M>(k: K, v: M[K]): void {
    this.l.get(k)?.forEach((fn) => (fn as Listener<M[K]>)(v));
  }
}

export interface Interaction {
  kind: 'rig' | 'slot' | 'cooling' | 'decor' | 'npc' | 'zone' | 'scrap';
  spot?: number;
  rigId?: number;
  x?: number;
  y?: number;
  npc?: string;
  action?: string;
}

interface StoreEvents extends Record<string, unknown> {
  state: StateDTO;
  event: GameEvent;
  interact: Interaction;
  error: string;
  pause: boolean;
  hotkey: string;
  /** Coins fly from this screen spot (0..1 fractions) into the coin panel. */
  coinBurst: { fx: number; fy: number; label?: string; count?: number };
}

export class Store extends Emitter<StoreEvents> {
  state: StateDTO | null = null;
  private receivedAt = 0;
  private menuDepth = 0;
  private timer: number | null = null;
  private busy = false;
  private queue: (() => Promise<void>)[] = [];

  /** Dev-only switch for automated testing in a background tab. */
  ignoreHidden = import.meta.env.DEV && new URLSearchParams(location.search).has('bg');

  get paused(): boolean {
    return this.menuDepth > 0 || (document.hidden && !this.ignoreHidden);
  }

  /** Display minute, interpolated between server ticks. */
  displayMinute(): number {
    const s = this.state;
    if (!s) return 0;
    if (this.paused || s.farm.paused) return s.farm.minute;
    const elapsed = Math.min(performance.now() - this.receivedAt, TICK_INTERVAL_MS * 2);
    return Math.min(s.farm.minute + elapsed / REAL_MS_PER_GAME_MINUTE, DAY_END_MINUTE);
  }

  setState(s: StateDTO): void {
    this.state = s;
    this.receivedAt = performance.now();
    this.emit('state', s);
  }

  private apply(r: ActionResponse): void {
    this.setState(r.state);
    for (const e of r.events) this.emit('event', e);
  }

  /** Serialize server calls so ticks and actions never race. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) await this.queue.shift()!();
    this.busy = false;
  }

  async act(action: GameAction): Promise<ActionResponse | null> {
    try {
      const r = await this.enqueue(() => api.act(action));
      this.apply(r);
      return r;
    } catch (e) {
      this.emit('error', e instanceof ApiError ? e.message : 'Something went wrong.');
      return null;
    }
  }

  async tick(): Promise<void> {
    if (!this.state) return;
    try {
      const r = await this.enqueue(() => api.tick(this.paused));
      this.apply(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        this.emit('error', 'Your session ended. Please reload and sign in again.');
    }
  }

  start(): void {
    this.stop();
    void this.tick();
    this.timer = window.setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => void this.tick();

  /** Open a menu: game time pauses (MASTERPLAN §6). */
  pushMenu(): void {
    this.menuDepth++;
    if (this.menuDepth === 1) {
      this.emit('pause', true);
      void this.tick();
    }
  }

  popMenu(): void {
    this.menuDepth = Math.max(0, this.menuDepth - 1);
    if (this.menuDepth === 0) {
      this.emit('pause', false);
      void this.tick();
    }
  }

  get inMenu(): boolean {
    return this.menuDepth > 0;
  }

  qty(itemId: string): number {
    return this.state?.inventory.find((i) => i.itemId === itemId)?.qty ?? 0;
  }
}

export const store = new Store();

/** Player-facing rig name: numbered within this farm ("Rig 3"), not the global database id. */
export function rigName(id: number): string {
  const ids = (store.state?.rigs ?? []).map((r) => r.id).sort((a, b) => a - b);
  const i = ids.indexOf(id);
  return i >= 0 ? `Rig ${i + 1}` : 'Rig';
}
