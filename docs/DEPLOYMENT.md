# Deployment & launch checklist

## 1. Still to verify (MASTERPLAN §16)

These are configuration, not code. Nothing in the repo hard-codes them.

| Item                                                    | Where it goes                                           | Notes                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robinhood Chain IDs, RPC, explorer                      | `CHAIN_ID`, `RPC_URL`, `PUBLIC_RPC_URL`, `EXPLORER_URL` | Defaults point at testnet (46630). Public sources list mainnet as 4663 / `https://rpc.mainnet.chain.robinhood.com`; confirm on docs.robinhood.com/chain before use.                                                    |
| Canonical NVDA Stock Token address and decimals         | `NVDA_TOKEN_ADDRESS`, `NVDA_DECIMALS`                   | Take it **only** from Robinhood's official contract list. At the time of writing the protocol-contracts page did not list Stock Token addresses.                                                                       |
| Stock Token transfers to arbitrary self-custody wallets | —                                                       | Confirm transfers out of the distributor to any EOA succeed (no allow-list or KYC gate on the token). Do a small real transfer first.                                                                                  |
| NVDA price feed                                         | `PRICE_FEED` = `chainlink` / `http` / `static`          | `chainlink` reads any `latestRoundData()` aggregator; `http` reads a JSON field from any price API. If the feed is down, harvests keep their USD value and convert on the next good price.                             |
| Gas sponsorship                                         | `RELAYER_PRIVATE_KEY`                                   | Implemented as a relayer that only calls `claim`. An ERC-4337 paymaster can replace it later; the contract already accepts claims from any sender. Without a relayer, players submit the claim themselves and pay gas. |
| Jurisdiction / eligibility                              | Terms of Service                                        | The game shows a short eligibility note in Settings. Add proper Terms before launch.                                                                                                                                   |

## 2. Contract deployment

```bash
cd contracts
forge test
```

```bash
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
```

Environment for the script: `DEPLOYER_PRIVATE_KEY`, `TOKEN_ADDRESS`, `OWNER_ADDRESS` (treasury, hardware wallet), `VOUCHER_SIGNER_ADDRESS` (server), `PAUSER_ADDRESS` (optional emergency key — the relayer address works well), `PERIOD_SECONDS`, `PERIOD_CEILING`, `MAX_CLAIM` (token units).

Recommended starting limits: period 1 day, ceiling ≈ expected daily payouts × 2, max claim ≈ $50 worth.

Then from the **treasury** wallet: transfer NVDA to the distributor (weekly top-ups per MASTERPLAN §10). Unused funds can be pulled back with `withdrawBack`.

## 3. Server

- `NODE_ENV=production`, `DATABASE_URL` (PostgreSQL 15+), `ADMIN_TOKEN` (long random), `COOKIE_SECURE=true`.
- `SIWE_DOMAIN` / `SIWE_URI` must match the public game URL exactly; `CORS_ORIGINS` lists the game and admin origins.
- `VOUCHER_SIGNER_KEY` → its address must equal the contract's `voucherSigner`. Rotate with `setVoucherSigner` from the treasury.
- `RELAYER_PRIVATE_KEY` → keep a small ETH balance; it can only ever cause `claim` calls.
- `ALERT_WEBHOOK_URL` → receives `{text}` when the contract balance falls below the admin threshold.
- Run `pnpm --filter @rig-valley/server start` behind a TLS reverse proxy that forwards `/api` to it. Serve `client/dist` and `admin/dist` as static sites. Restrict the admin site (VPN / IP allow-list) in addition to the token.

## 4. Before mainnet

- [ ] Full testnet run with real players, including at least one refund path (let a voucher expire).
- [ ] External review of `RigValleyDistributor` and the withdrawal flow.
- [ ] Balancing pass: Coins prices, component stats and cycle times (MASTERPLAN §16) — tune from the admin panel and `packages/shared/src/items.ts`.
- [ ] Treasury on a hardware wallet; owner transfer uses `Ownable2Step`.
- [ ] Monitoring: server logs, alert webhook, admin dashboard pending liabilities vs contract balance.
- [ ] Terms of Service with eligibility language.

## 5. Emergency levers

| Problem                | Lever                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Suspicious withdrawals | Admin panel → Pause withdrawals (server stops issuing vouchers)                   |
| Server compromised     | `pause()` on the contract from the pauser or treasury key; rotate `voucherSigner` |
| A single bad voucher   | `revokeNonce(nonce)` from pauser or owner                                         |
| Recover funds          | `withdrawBack(to, amount)` from the treasury                                      |
