# Rig Valley

A cozy 2D pixel-art farming game where the crops are crypto-mining rigs. Harvested rigs pay small real rewards in NVIDIA Stock Tokens (NVDA) on Robinhood Chain. The full design lives in [MASTERPLAN.md](MASTERPLAN.md).

## What's in the box

| Path                                 | What it is                                                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/shared`](packages/shared) | Game rules shared by server and client: palette, item catalog, rig simulation (temperature, cycles, power), time and seasons, weather, NPCs, shops, quests, letters, economy math, EIP-712 types, API types.                             |
| [`server`](server)                   | Authoritative game server — Fastify + PostgreSQL (or embedded PGlite for local dev). SIWE sign-in, server-side clock, every game action, harvest → Coins + NVDA, vouchers, gas-sponsoring relayer, withdrawal reconciliation, admin API. |
| [`client`](client)                   | The game — Phaser 3 + TypeScript + Vite, 640×360 rendered at 2×. Tiled JSON world, procedural palette-locked pixel art, night lighting with Bayer dithering, DOM UI in the Tiny5 pixel font, wallet create / import / connect.           |
| [`admin`](admin)                     | Admin panel — reward config, live dashboard and alerts, pause / resume withdrawals, Market Board prices and seasonal modifiers, player lookup.                                                                                           |
| [`contracts`](contracts)             | Foundry project — `RigValleyDistributor` (EIP-712 vouchers, single-use nonces, expiry, pause, per-period ceiling, per-voucher cap, withdraw-back) and a test-only mock token.                                                            |

## Quick start (local)

Requirements: Node 22+, pnpm 10. Foundry is only needed for contracts and local on-chain testing.

```bash
pnpm install
```

```bash
cp .env.example .env
```

Set `ADMIN_TOKEN` in `.env` (any random string, 16+ characters). Leave `DATABASE_URL` empty to use the embedded database in `.data/`.

```bash
pnpm dev
```

- Game: http://localhost:5173
- Admin: http://localhost:5174
- API: http://localhost:8787 (the Vite dev servers proxy `/api` to it)

Without chain settings everything works except Withdraw, which shows "Withdrawals aren't switched on yet".

### Local end-to-end withdrawals (anvil)

```bash
anvil --chain-id 46630
```

```bash
cd contracts && forge build
```

```bash
pnpm --filter @rig-valley/server local-chain --write-env
```

This deploys a **test-only** mock NVDA token and the distributor to anvil, funds it, and writes the chain settings into `.env` using anvil's public dev keys. Restart `pnpm dev`. Withdrawals now go all the way on-chain with sponsored gas.

### Using PostgreSQL

```bash
docker compose up -d
```

Then set `DATABASE_URL=postgres://rigvalley:rigvalley@localhost:5432/rigvalley` in `.env`. Migrations run automatically on start.

## Scripts

| Command                                        | What it does                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                     | Server + game + admin with hot reload                                                               |
| `pnpm test`                                    | All unit and integration tests (the anvil e2e test runs when anvil is up)                           |
| `pnpm contracts:test`                          | Foundry tests incl. fuzzing                                                                         |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Quality gates                                                                                       |
| `pnpm build`                                   | Production builds of game and admin                                                                 |
| `pnpm art`                                     | Regenerate all sprites (`client/public/assets`) and the Tiled map (`client/public/maps/world.json`) |

## How the game works (short)

- **Server-authoritative.** The client sends actions and a heartbeat every 4 s; the server owns the clock, energy, rigs, harvests and rewards. Time advances only while a player is connected and not in a menu (each heartbeat covers at most 10 s of real time, so being away freezes the world).
- **Day:** 6:00 AM → 2:00 AM, 10 in-game minutes ≈ 7 real seconds. Sleep refills Energy; passing out at 2 AM costs a small Coins fee.
- **Rigs:** frame (tier caps part rarity) + CPU / Cooler / PSU. `temp = air + CPU heat − cooler − casing − river − cooling units in range + weather + neighbors + dust + worn paste`. Above 80 °C a rig slows down, above 95 °C it overheats and stops until serviced. Power draw over capacity trips the breaker at night.
- **Rewards:** each harvest pays Coins plus a USD amount (admin-configured; $0.08 for the first 60 harvests, then $0.02) converted to NVDA at harvest time. Withdraw unlocks at $5. Coins never convert to NVDA; quests, events and NPCs never pay NVDA.
- **Progression:** garage → backyard → warehouse by the river (water cooling) → data center on the hill (service drones), driven by Uncle Ray's letters.

## Reward architecture

```
Treasury (owner, offline) ──top-up──► RigValleyDistributor ◄── claim(voucher) ── relayer (gas sponsored)
                                              ▲                                        ▲
Player wallet ── signs WithdrawRequest ──► Game server (checks ≥ $5, signs EIP-712 voucher)
```

- The treasury key never touches the server. The server holds a voucher-signing key (cannot move funds) and optionally a relayer key that only ever calls `claim`.
- Vouchers bind player, amount, nonce and expiry. Pending rewards are deducted only after a successful pre-flight simulation, and refunded only after the voucher has expired unused on-chain — no double spending.
- Worst case if the server is compromised: the contract balance, further limited by the per-period ceiling and per-voucher cap.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the mainnet checklist and the items that still need verification.
