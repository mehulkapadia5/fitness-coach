-- Add calories_kcal to existing meals so we can sum it for the daily target.
ALTER TABLE meals ADD COLUMN calories_kcal INTEGER;

-- Generic targets table. Setting a target with the same `kind` while one is
-- already active soft-deletes the old one (deactivated_at gets filled in)
-- so history is preserved but only the most recent row per kind is "live".
CREATE TABLE targets (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,         -- 'protein_g', 'calories_kcal', 'workouts_per_week', 'sleep_hours', or anything else Claude wants
  target_value    REAL NOT NULL,         -- 150, 2500, 5, 8 etc.
  unit            TEXT NOT NULL,         -- 'g', 'kcal', 'count', 'hours', etc.
  period          TEXT NOT NULL,         -- 'daily' | 'weekly' | 'by_date' | 'ongoing'
  comparison      TEXT NOT NULL,         -- 'gte' (at least), 'lte' (at most), 'eq'
  set_on          TEXT NOT NULL,         -- IST date when set, 'YYYY-MM-DD'
  set_at          TEXT NOT NULL,         -- UTC ISO timestamp
  deactivated_at  TEXT,                  -- UTC ISO timestamp; NULL = active
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_targets_kind_active ON targets(kind, deactivated_at);
