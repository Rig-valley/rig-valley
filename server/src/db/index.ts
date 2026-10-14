/**
 * Database access. PostgreSQL in production (`DATABASE_URL`), embedded
 * PGlite (real Postgres compiled to WASM) for zero-setup local development.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { ITEMS } from '@rig-valley/shared';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'pg' | 'pglite';
}

class PgDb implements Db {
  kind = 'pg' as const;
  constructor(private pool: pg.Pool) {}
  async query<T>(sql: string, params: unknown[] = []) {
    const r = await this.pool.query(sql, params);
    return { rows: r.rows as T[] };
  }
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Queryable = {
        query: async <R>(sql: string, params: unknown[] = []) => ({
          rows: (await client.query(sql, params)).rows as R[],
        }),
      };
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}

class PgliteDb implements Db {
  kind = 'pglite' as const;
  /** PGlite is single-connection: serialize transactions. */
  private chain: Promise<unknown> = Promise.resolve();
  /**
   * Queries issued from inside a transaction's async context must run on that
   * transaction, or the single PGlite connection deadlocks waiting for itself.
   */
  private current = new AsyncLocalStorage<Queryable>();
  constructor(private db: PGlite) {}
  async query<T>(sql: string, params: unknown[] = []) {
    const tx = this.current.getStore();
    if (tx) return tx.query<T>(sql, params);
    const r = await this.db.query<T>(sql, params);
    return { rows: r.rows };
  }
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const outer = this.current.getStore();
    if (outer) return fn(outer); // nested: reuse the open transaction
    const run = this.chain.then(() =>
      this.db.transaction(async (t) => {
        const tx: Queryable = {
          query: async <R>(sql: string, params: unknown[] = []) => ({
            rows: (await t.query<R>(sql, params)).rows,
          }),
        };
        return this.current.run(tx, () => fn(tx));
      }),
    );
    this.chain = run.catch(() => {});
    return run;
  }
  async close() {
    await this.db.close();
  }
}

export async function openDb(opts: { databaseUrl?: string; pgliteDir?: string }): Promise<Db> {
  let db: Db;
  if (opts.databaseUrl) {
    // Return BIGINT/COUNT as JS numbers-as-strings consistently; we normalize with Number().
    db = new PgDb(new pg.Pool({ connectionString: opts.databaseUrl, max: 10 }));
  } else {
    const dir = opts.pgliteDir ?? 'memory';
    if (dir !== 'memory') mkdirSync(dir, { recursive: true });
    db = new PgliteDb(new PGlite(dir === 'memory' ? undefined : dir));
  }
  await migrate(db);
  return db;
}

const here = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS: { id: number; file: string }[] = [{ id: 1, file: '001_init.sql' }];

async function migrate(db: Db): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (id INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const done = new Set(
    (await db.query<{ id: number }>('SELECT id FROM schema_migrations')).rows.map((r) =>
      Number(r.id),
    ),
  );
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    const sql = readFileSync(join(here, 'migrations', m.file), 'utf8');
    await db.transaction(async (tx) => {
      for (const stmt of splitSql(sql)) await tx.query(stmt);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
  }
  await seedItems(db);
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

/** Keep the `items` catalog table in sync with the shared catalog. */
async function seedItems(db: Db): Promise<void> {
  for (const i of ITEMS) {
    const {
      id,
      name,
      type,
      rarity,
      price,
      description: _d,
      icon: _i,
      sellable: _s,
      ...stats
    } = i as unknown as Record<string, unknown>;
    await db.query(
      `INSERT INTO items (id, name, type, rarity, price, stats) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, rarity = EXCLUDED.rarity, price = EXCLUDED.price, stats = EXCLUDED.stats`,
      [id, name, type, rarity ?? null, price, JSON.stringify(stats)],
    );
  }
}
