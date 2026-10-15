# Rig Valley — Master Plan

> A cozy 2D pixel-art farming game (Harvest Moon / Stardew Valley style) where the crops are crypto-mining rigs. Harvested rigs pay small real rewards in NVIDIA Stock Tokens (NVDA) on Robinhood Chain.
>
> This document collects every decision made during the concept phase. Treat **Locked** items as requirements. Items marked **Verify** must be checked against current docs before implementation.

---

## 1. Hard rules

1. **Game name: Rig Valley.**
2. **All in-game text is English.** UI, dialogue, item names, notifications, errors, tooltips, accessibility labels. No exceptions.
3. **Desktop browser only** for v1. No mobile layout work, no native app.
4. **Self-custody only.** The game never stores, receives, or can reconstruct a player's private key.
5. **One wallet = one farm.** A wallet address can own exactly one farm, ever.
6. **Coins never convert to NVDA**, and Coins cannot be transferred between players.
7. **The only source of NVDA is harvesting rigs.** Events, quests and NPCs reward items/Coins only.
8. **Tone is light and funny**, written for players who know nothing about crypto. Avoid jargon (see Glossary).

---

## 2. Platform & tech stack

| Layer | Choice | Notes |
|---|---|---|
| Game client | **Phaser 3 + TypeScript + Vite** | Top-down 3/4 camera, tilemaps (Tiled JSON), sprite animation |
| Wallet (connect) | **wagmi + viem** | MetaMask and any injected EVM wallet |
| Wallet (create) | **viem** (or ethers) + BIP-39 | Generated client-side; see §5 |
| Auth | **Sign-In With Ethereum (SIWE)** | Free signature, no gas. Session keyed by address |
| Backend | **Node.js + TypeScript** (Fastify or similar) | Authoritative game state, harvest calc, voucher signing |
| Database | **PostgreSQL** | Farms, rigs, inventory, balances, logs |
| Contracts | **Solidity + Foundry** | Distribution (claim) contract on Robinhood Chain |
| Chain | **Robinhood Chain** (Arbitrum-based L2, EVM, ETH gas) | **Verify** chain ID, RPC, explorer from official docs |
| Reward asset | **NVDA Stock Token** | **Verify** canonical contract address from Robinhood's official list only |
| Price feed | Oracle or trusted price API | **Verify** what is available for NVDA on Robinhood Chain |
| Gas sponsorship | ERC-4337 paymaster or relayer | **Verify** provider support on Robinhood Chain |

The server is authoritative: the client sends actions, the server validates time/energy/state and computes harvests. Never trust client-side timers or reward math.

---

## 3. Art direction

- **Native resolution 640×360, rendered at 2×** (1280×720) with nearest-neighbor scaling (`pixelArt: true`, `image-rendering: pixelated`).
- Camera: 3/4 top-down. Light always comes from the top-left.
- Mood: **"cozy tech, night edition."** Dark bluish world; only light sources are bright (warm lamps, rig neon, screens).
- Every color lives on a dark→light **ramp**. Shading = one step along the ramp, never a new color.
- Light falloff uses **ordered (Bayer) dithering**, not smooth gradients.
- Man-made objects get a dark outline (`#0b0a1a`). Nature uses the dark end of its own ramp.
- **Neon = status:** cyan/magenta = rig active, green = healthy, yellow = booting, red = overheating.
- UI panels: dark (`#141331`), 2 px border (`#3d438a`) with a cyan top edge, chamfered corners. Font: **Pixelify Sans**.

### Palette (44 colors)

| Ramp | Hex (dark → light) |
|---|---|
| Night | `#0b0a1a` `#141331` `#1e1d4a` `#2a2b63` `#3d438a` |
| Grass | `#0c2429` `#123a3b` `#1b5249` `#2a7058` `#45966c` `#7cc48a` |
| Soil | `#1f1424` `#33202f` `#4d2c3e` `#6e4049` |
| Wood | `#33192a` `#5c2f36` `#94504a` `#cf8556` |
| Warm light | `#ffae57` `#ffd685` `#fff3c9` |
| Stone | `#18162f` `#25234a` `#373665` `#514f85` `#7a7aac` |
| Metal | `#24253f` `#3b3e62` `#5d628e` `#8e94bf` `#cdd2ef` |
| Water | `#0d1840` `#14275c` `#1f3d80` `#3d6fb8` |
| Neon | cyan `#3ff2ff`/`#1593b8`, magenta `#ff52dc`/`#a82599`, green `#5cffab`/`#1fae6d`, yellow `#ffe347`/`#b88a1c`, red `#ff4558`/`#a3203a` |
| Coin | `#8a4416` `#e0912a` `#ffd447` `#fff6c4` |

### Rig visual states
`Empty slot` (dashed cyan hologram) → `CPU installed` (green board) → `Booting` (yellow LED, fans off) → `Mining` (cyan fans, cyan/magenta RGB strip) → `Ready to claim` (floating gold coin + sparkles) → `Overheat` (red LED, orange fans, steam).

---

## 4. Glossary for in-game copy

Write for non-crypto players. Use the left column in UI.

| In-game word | Instead of |
|---|---|
| Speed | Hashrate |
| Rig | Miner |
| Harvest / Ready to claim | Block reward |
| Health | Durability |
| Temp | Thermal load |
| Power | Wattage / load |
| Rewards | Yield / emissions |
| Withdraw | Claim on-chain / bridge |
| Recovery words | Seed phrase / mnemonic (explain once) |

Numbers use English formatting: `12,480` and `0.32`.

---

## 5. Onboarding

1. **Title screen** — night garage, neon sign, soft rig hum, `Start`.
2. **Account** — two buttons only:
   - **Connect Wallet** — MetaMask or any EVM wallet. Player signs a SIWE message (no gas).
   - **Create New Wallet** — generated **on the player's device**:
     - Generate a BIP-39 **12-word recovery phrase**.
     - Show the 12 words; player must **confirm several words** before continuing.
     - Copy: *"Write these words down. If you lose them, nobody (not even us) can get your farm back."*
     - Store an **encrypted keystore locally** (IndexedDB), protected by a player password.
     - The key **never leaves the device**; the server only ever sees the address and signatures.
   - **Import Wallet** — restore from 12 words on a new device.
3. **Name your farm** — unique name, permanently bound to the wallet.
4. **Character** — name, hair color, hat.
5. **Story opener** — letter from Uncle Ray: *"Kid, the garage is yours now. Don't let the cats near the big building on the hill."*
6. **Tutorial by doing** (one short hint per step): walk to garage → take CPU from inherited box → install → power on (yellow → green LED) → clean dust → sleep. **The tutorial rig harvests next morning** so the first claim happens within ~10 minutes of play.
7. **First quest** — letter from Mia inviting the player to town; introduces Coins, shops, and the Withdraw progress bar (*"Save up $5 and send it to your wallet anytime."*).

**Settings:** Export private key (password-gated, with a clear warning), show recovery words (password-gated), wallet address with explorer link.

---

## 6. Time, energy & daily loop

- **Day runs 6:00 AM → 2:00 AM.** 10 in-game minutes ≈ 7 real seconds (~14–15 min per day).
- **Time pauses** while menus/inventory are open.
- **Time only advances while playing.** Offline = world frozen.
- **Energy: 100 per day.**
  - Sleep before midnight → full refill.
  - Sleep 12:00–2:00 AM → partial refill.
  - Still awake at 2:00 AM → pass out where standing, wake with 50 energy, pay a small Coins fee.
  - Coffee/food from Miner's Café restores some energy.
- **Shop hours:** Hardware Store 9 AM–5 PM, Repair Shop 10 AM–6 PM, Miner's Café until 10 PM, Market Board always open. One closed day per week for some shops.
- **Overnight processing (on sleep):** advance rig cycles, apply condition decay and dust, roll tomorrow's weather, accrue power bill, update pending NVDA, deliver mail.
- **Mailbox:** daily letters (quests, bills, NPC notes, event news). Primary way to guide players without noisy tutorials.
- **Bedtime:** sleep from 8:00 PM, or from 2:00 PM when worn out (Energy ≤ 30). Day 1 is free (tutorial night). Stops back-to-back day skipping.
- **Daily NVDA limit per farm** (added after the launch audit): 24 NVDA-paying harvests per UTC day by default, admin-editable; later harvests pay Coins only. See §9.

---

## 7. Rig system

### Components
A rig has a **rig tier** (casing/board) and **three slots**:

| Slot | Controls |
|---|---|
| **CPU** | Harvest cycle length (Speed) and heat output |
| **Cooler** | How much heat the rig can shed |
| **PSU** | Power efficiency (watts drawn) |

Rarities: **Common, Uncommon, Rare, Epic.** Rig tier caps the rarity that can be installed. All components are bought with **Coins**.

### Harvest cycle
Like crops, but auto-replanting: when the cycle completes the rig shows a coin; after claim the next cycle starts automatically.

| CPU rarity | Cycle (in-game days) |
|---|---|
| Common | 2 |
| Uncommon | 1.5 |
| Rare | 1 |
| Epic | 0.5 |

Each harvest pays **Coins + NVDA** (NVDA per harvest is the same for every rig; better rigs simply harvest more often).

### Temperature
`temp = base + cpu_heat − cooler_power − cooling_units_in_range + weather_modifier + neighbor_penalty`

- **> 80 °C:** cycle progress slows.
- **> 95 °C:** **Overheat** — rig stops until serviced.
- Adjacent rigs add heat → **layout is strategy**.

### Cooling units (the "sprinklers")
Placeable items that cool an area around them (3×3 at level 1, larger at higher levels). Players optimize field layout around them.

### Condition & maintenance
- Condition drops a little every day; dust builds up; thermal paste wears out.
- Actions: **Clean** (cloth), **Repaste** (thermal paste), **Repair** (screwdriver, or pay Coins at Repair Shop).
- At 0 condition the rig is **broken** and stops. **No permanent loss** — it can always be repaired.

### Power
- Garage starts at **500 W capacity**.
- If total draw exceeds capacity, the **breaker trips at night** and all rigs stop until morning.
- Raise capacity via wiring upgrades, rooftop solar, or contracts at the Power Substation.
- **Weekly power bill** in Coins (paid automatically on Monday mornings). What can't be paid is owed to Vera; two short bills in a row cut the power until the debt is paid at her Substation.

### Energy cost per action
| Action | Energy |
|---|---|
| Clean dust | 2 |
| Replace thermal paste | 4 |
| Repair rig | 8 |
| Install / build a rig | 10 |

---

## 8. Progression

| Stage | Location | Unlocks |
|---|---|---|
| 1 | Inherited garage | Few rig slots, low power, Common parts |
| 2 | Expanded garage & yard | More slots, Cooling unit Lv2, Uncommon parts |
| 3 | Warehouse by the river | **River water cooling**, rooftop solar, Rare parts |
| 4 | Data center on the hill | Top-tier rigs, Epic parts, **service drones** (maintain rigs with no player energy) |

Unlock requirements combine Coins, number of active rigs, and story quests (Uncle Ray letters). The data center is "locked" because Uncle Ray's cats sleep on the warm rigs.

---

## 9. Economy

### Coins (off-chain, in-game only)
**Sources:** rig harvests, daily quests, selling used parts, small odd jobs in town (mini-games), event prizes.
**Sinks:** power bills, thermal paste, cloths, repairs, components, cooling units, new rigs, power upgrades, stage unlocks, decorations, outfits, rig paint, NPC gifts.
**Rules:** not transferable, not convertible to NVDA. Adding rigs without upgrading power/cooling should eventually lose money — choices must matter.

### Market Board
NPC shop (not player-to-player). Buy/sell prices **fluctuate daily** and by season (e.g. parts pricier when everyone expands).

### NVDA rewards (on-chain)
- **Configured in USD per harvest** in the admin panel; converted to NVDA at harvest time using the price feed.
- **Beginner boost:** first **60 harvests** pay **$0.08** each (~10–12 h of play to reach the first $5).
- **Normal rate:** **$0.02** per harvest (~40 h with starter rigs per $5; faster with upgrades).
- Pending balance stored in **NVDA units**, displayed with a USD estimate.
- **Withdraw:** manual button, unlocks at **≥ $5** equivalent, and once the farm is **3 days old** (admin-editable). Shows amount, destination address, then player signs.
- **Gas:** sponsored by the operator for every withdrawal. Sponsorship policy must only cover calls to the distribution contract's claim function.
- UI states: locked (`$1.40 more to unlock`), unlocked (neon), pending tx, success with explorer link, withdrawal history.

**Rough budget model:** ~$0.12 per player-hour at the normal rate with starter rigs (more for upgraded players), plus up to ~$5 one-time beginner boost per new player.

---

## 10. Reward distribution architecture

```
Treasury wallet (operator, hardware/offline)
        │  periodic top-up (e.g. weekly)
        ▼
Distribution contract (Robinhood Chain)
        ▲  claim(voucher, signature)  ← gas sponsored
        │
Player wallet ── requests voucher ──► Game server
                                       (verifies pending ≥ $5,
                                        signs EIP-712 voucher)
```

- **Treasury key never touches the server.**
- Server holds only a **voucher-signing key** (cannot move funds by itself).
- Voucher contains: player address, amount, nonce, expiry. Contract enforces nonce (no replay), expiry, and signer.
- Contract has **pause**, **per-period payout ceiling**, and operator **withdraw-back** for unused funds.
- If the server is compromised, maximum loss = current contract balance.

---

## 11. Town & NPCs

| NPC | Role | Relationship perks |
|---|---|---|
| **Uncle Ray** | Absent; leaves letters (tutorial + main story) | Story progression |
| **Mia** | Hardware Store owner, blunt but honest | Early notice of rare stock, discounts |
| **Bo** | Miner's Café barista, town gossip, comic relief | Weather/event tips, energy drinks |
| **Dex** | Repair Shop mechanic | Cheaper repairs, cooling unit recipes |
| **Vera** | Runs the Power Substation | Power upgrades, outage quests |
| **Kai** | Rival miner with a bigger garage | Hash races at events; becomes a friend |

- Friendship rises via daily chats, liked gifts (bought with Coins), and quests. Each level unlocks something concrete.
- Quest types: **daily** (mailbox/town board, quick, Coins), **relationship** (personal stories), **main** (Uncle Ray letters → data center).

### Map (starter)
Town square with hologram coin statue, benches, Market Board; Hardware Store, Miner's Café, Repair Shop; main road with bridge over the river; Power Substation (north-east, gated); player garage with yard/field (south-west); data center on the hill (south-east, locked). Roads are a single clean network with uniform cobble pattern and 2 px curbs.

---

## 12. Seasons, weather & events

28 in-game days per season, 4 seasons per year (~28 h of play).

| Season | Theme | Event (items/decor only) |
|---|---|---|
| Spring | Mild, beginner-friendly | Spring Fair — tidiest rig field contest |
| Summer | Heatwaves, overheating | Cool Down Festival by the river |
| Fall | Good sell prices, stable power | Harvest Night market |
| Winter | Rigs run cooler, storms cause outages | Winter Glow — neon lights, gift swap |

**Daily weather** (announced each morning): Sunny (normal), Rainy (no dust that day), Heatwave (+temp all rigs), Storm (chance of night outage), Snow (cooler rigs, power less stable).

**Event prizes are items and decorations only. Never NVDA.**

---

## 13. Admin panel (required)

- Edit USD reward per harvest (normal + beginner boost amount + boost harvest count) **without a client update**.
- Live dashboard: NVDA paid today/this week, pending liabilities, number of withdrawals.
- **Alert** when distribution-contract balance falls below a threshold.
- Pause/resume withdrawals.
- Edit Market Board base prices and seasonal modifiers.
- Player lookup by wallet address (read-only state, harvest log).

---

## 14. Data model (sketch)

- `farms` — wallet_address (unique), farm_name (unique), created_at, stage, energy, in-game date/time, season, weather
- `rigs` — farm_id, tile_x, tile_y, rig_tier, cpu_id, cooler_id, psu_id, condition, dust, paste, temp, cycle_progress, state
- `items` — catalog: type, rarity, stats, price
- `inventory` — farm_id, item_id, qty
- `cooling_units` — farm_id, tile_x, tile_y, level
- `coins_ledger` — farm_id, delta, reason, ts
- `harvests` — farm_id, rig_id, ts, coins, usd_value, nvda_amount, price_used, boosted (bool)
- `nvda_pending` — farm_id, amount
- `withdrawals` — farm_id, amount, nonce, voucher, tx_hash, status
- `npc_relations` — farm_id, npc_id, level, points
- `quests` — farm_id, quest_id, state
- `config` — reward and economy parameters (admin-editable)

---

## 15. Build phases (suggested order)

1. **Scaffold** — monorepo: `client/` (Phaser+Vite+TS), `server/`, `contracts/` (Foundry), `admin/`. Lint, formatting, shared types package.
2. **World** — tilemap for garage + yard, player movement, camera, collisions, palette-locked placeholder art.
3. **Time & energy** — clock, pause-in-menu, sleep, pass-out, overnight tick (server-authoritative).
4. **Rigs** — install components, cycle, temperature, cooling units, condition/maintenance, power capacity & breaker, harvest → Coins.
5. **Town** — shops, Market Board pricing, NPC dialogue, relationships, mailbox, daily quests.
6. **Accounts** — Connect Wallet (wagmi/SIWE), Create/Import Wallet (BIP-39, local encrypted keystore, confirm-words flow), one-wallet-one-farm, farm naming, settings export.
7. **Rewards (testnet first)** — USD→NVDA conversion, pending balance, beginner boost, voucher signing, distribution contract with nonce/expiry/pause/ceiling, sponsored-gas withdrawal, history.
8. **Admin panel** — config editing, dashboard, alerts, pause.
9. **Content** — progression stages 2–4, seasons, weather, events, story letters, all English copy.
10. **Polish & launch** — audio, juice (particles, glow), balancing pass, contract review, mainnet deployment.

---

## 16. Open items

- **Verify** Robinhood Chain network details, canonical NVDA Stock Token contract, and transfer behavior to arbitrary self-custody wallets.
- **Verify** price-feed source for NVDA on Robinhood Chain.
- **Verify** ERC-4337 paymaster / relayer availability on Robinhood Chain.
- Stock Token availability varies by jurisdiction; operator decided to proceed. Consider at least Terms of Service language on eligibility.
- Exact Coins prices, component stats, and cycle balancing — first pass during phase 4, tuned after playtests.
