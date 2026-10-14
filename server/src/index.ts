/** Rig Valley game server entry point. */
import { chainEnabled, loadConfig } from './config.js';
import { createServer } from './server.js';

async function main() {
  const cfg = loadConfig();
  const { app, withdrawals, monitor, db } = await createServer(cfg);
  if (!cfg.DATABASE_URL)
    app.log.warn(
      `Using embedded PGlite at ${cfg.PGLITE_DIR} (development only). Set DATABASE_URL for Postgres.`,
    );
  if (!chainEnabled(cfg))
    app.log.warn('Chain not configured: withdrawals are disabled. See .env.example.');
  if (!cfg.ADMIN_TOKEN) app.log.warn('ADMIN_TOKEN not set: the admin panel is disabled.');

  const timers = [
    setInterval(() => void withdrawals.reconcile().catch((e) => app.log.error(e)), 15_000),
    setInterval(() => void monitor.check(), 60_000),
  ];
  void monitor.check();

  await app.listen({ host: cfg.HOST, port: cfg.PORT });

  const shutdown = async () => {
    timers.forEach(clearInterval);
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
