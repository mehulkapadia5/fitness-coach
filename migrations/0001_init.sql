CREATE TABLE workouts (
  id           TEXT PRIMARY KEY,
  done_on      TEXT NOT NULL,         -- 'YYYY-MM-DD' in IST (the canonical "day" field)
  done_at      TEXT NOT NULL,         -- ISO-8601 UTC timestamp
  type         TEXT NOT NULL,         -- 'push' | 'pull' | 'legs' | 'run' | 'walk' | 'rest' | 'mixed' | 'other'
  intensity    TEXT,                  -- 'light' | 'moderate' | 'heavy'
  duration_min INTEGER,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_workouts_done_on ON workouts(done_on DESC);

CREATE TABLE meals (
  id           TEXT PRIMARY KEY,
  eaten_on     TEXT NOT NULL,         -- 'YYYY-MM-DD' in IST
  eaten_at     TEXT NOT NULL,         -- ISO-8601 UTC
  description  TEXT NOT NULL,         -- raw what-was-said, verbatim
  protein_g    INTEGER,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_meals_eaten_on ON meals(eaten_on DESC);

CREATE TABLE logs (
  id           TEXT PRIMARY KEY,
  recorded_on  TEXT NOT NULL,         -- 'YYYY-MM-DD' in IST
  recorded_at  TEXT NOT NULL,         -- ISO-8601 UTC
  kind         TEXT NOT NULL,         -- free-form: 'mood', 'energy', 'sleep', 'note', 'fap', anything
  value        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_logs_recorded_on ON logs(recorded_on DESC);
CREATE INDEX idx_logs_kind ON logs(kind, recorded_on DESC);
