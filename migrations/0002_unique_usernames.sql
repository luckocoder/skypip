ALTER TABLE players ADD COLUMN name_key TEXT NOT NULL DEFAULT '';

WITH duplicate_names AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(name)
           ORDER BY best DESC, best_at ASC, id ASC
         ) AS duplicate_rank
  FROM players
)
UPDATE players
SET name = 'Pip' || substr(id, 1, 11)
WHERE id IN (SELECT id FROM duplicate_names WHERE duplicate_rank > 1);

UPDATE players SET name_key = lower(name);

CREATE UNIQUE INDEX players_name_key_unique ON players(name_key);
