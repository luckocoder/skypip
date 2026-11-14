CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  best INTEGER NOT NULL DEFAULT 0,
  best_at INTEGER NOT NULL DEFAULT 0,
  week_key TEXT,
  week_score INTEGER,
  week_at INTEGER,
  games INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS players_best_rank
  ON players(best DESC, best_at ASC);

CREATE INDEX IF NOT EXISTS players_week_rank
  ON players(week_key, week_score DESC, week_at ASC);

CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS used_nonces_expiry
  ON used_nonces(expires_at);
