CREATE TABLE IF NOT EXISTS active_players (
  session_id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  latitude INTEGER,
  longitude INTEGER,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS active_players_last_seen
  ON active_players(last_seen);
