-- Rig Valley initial schema (MASTERPLAN §14)

CREATE TABLE farms (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  farm_name TEXT NOT NULL,
  farm_name_key TEXT NOT NULL UNIQUE,
  character JSONB NOT NULL,
  stage INT NOT NULL DEFAULT 1,
  energy INT NOT NULL DEFAULT 100,
  coins INT NOT NULL DEFAULT 0,
  day INT NOT NULL DEFAULT 1,
  minute DOUBLE PRECISION NOT NULL DEFAULT 360,
  season TEXT NOT NULL DEFAULT 'spring',
  paused BOOLEAN NOT NULL DEFAULT false,
  last_tick_at TIMESTAMPTZ,
  weather TEXT NOT NULL DEFAULT 'sunny',
  weather_tomorrow TEXT NOT NULL DEFAULT 'sunny',
  power_upgrades JSONB NOT NULL DEFAULT '[]',
  power_kwh DOUBLE PRECISION NOT NULL DEFAULT 0,
  tutorial_step INT NOT NULL DEFAULT 0,
  harvest_count INT NOT NULL DEFAULT 0,
  flags JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  rarity TEXT,
  price INT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE rigs (
  id SERIAL PRIMARY KEY,
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tile_x INT NOT NULL,
  tile_y INT NOT NULL,
  rig_tier INT NOT NULL,
  frame_id TEXT NOT NULL,
  cpu_id TEXT,
  cooler_id TEXT,
  psu_id TEXT,
  condition REAL NOT NULL,
  dust REAL NOT NULL,
  paste REAL NOT NULL,
  temp REAL NOT NULL,
  cycle_progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  powered BOOLEAN NOT NULL DEFAULT false,
  boot_remaining REAL NOT NULL DEFAULT 0,
  overheat BOOLEAN NOT NULL DEFAULT false,
  paint TEXT NOT NULL DEFAULT 'steel',
  tutorial BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (farm_id, tile_x, tile_y)
);

CREATE TABLE inventory (
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (farm_id, item_id)
);

CREATE TABLE cooling_units (
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tile_x INT NOT NULL,
  tile_y INT NOT NULL,
  level INT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (farm_id, tile_x, tile_y)
);

CREATE TABLE decor (
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tile_x INT NOT NULL,
  tile_y INT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (farm_id, tile_x, tile_y)
);

CREATE TABLE coins_ledger (
  id BIGSERIAL PRIMARY KEY,
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coins_ledger_farm ON coins_ledger (farm_id, ts DESC);

CREATE TABLE harvests (
  id BIGSERIAL PRIMARY KEY,
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  rig_id INT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  game_day INT NOT NULL,
  coins INT NOT NULL,
  usd_value NUMERIC(18, 6) NOT NULL,
  nvda_amount NUMERIC(78, 0) NOT NULL,
  price_used NUMERIC(18, 6),
  boosted BOOLEAN NOT NULL
);
CREATE INDEX harvests_farm ON harvests (farm_id, ts DESC);
CREATE INDEX harvests_ts ON harvests (ts);

CREATE TABLE nvda_pending (
  farm_id INT PRIMARY KEY REFERENCES farms(id) ON DELETE CASCADE,
  amount NUMERIC(78, 0) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  usd_backlog NUMERIC(18, 6) NOT NULL DEFAULT 0
);

CREATE TABLE withdrawals (
  id SERIAL PRIMARY KEY,
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  amount NUMERIC(78, 0) NOT NULL,
  usd_at_request NUMERIC(18, 6) NOT NULL,
  destination TEXT NOT NULL,
  nonce NUMERIC(78, 0) NOT NULL UNIQUE,
  request_deadline BIGINT NOT NULL,
  expiry BIGINT,
  player_signature TEXT,
  voucher_signature TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_farm ON withdrawals (farm_id, created_at DESC);
CREATE INDEX withdrawals_status ON withdrawals (status);

CREATE TABLE npc_relations (
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  npc_id TEXT NOT NULL,
  level INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  PRIMARY KEY (farm_id, npc_id)
);

CREATE TABLE quests (
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  state TEXT NOT NULL,
  progress JSONB NOT NULL DEFAULT '[]',
  created_day INT NOT NULL,
  PRIMARY KEY (farm_id, quest_id)
);

CREATE TABLE mail (
  id SERIAL PRIMARY KEY,
  farm_id INT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  day INT NOT NULL,
  template_id TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mail_farm ON mail (farm_id, id DESC);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE admin_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
