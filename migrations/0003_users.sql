-- Multi-user upgrade. Each user signs in via Google OAuth (or any upstream
-- IdP wired in src/oauth.ts) and gets a row here. user_id is then attached
-- to every data row so users see only their own data.
--
-- This migration assumes a fresh D1 — for the OSS v2 deployment that's the
-- expected case. (The original v1 deployment stays on `mehuls-clicky` with
-- its own pre-multi-user database.)

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  google_sub      TEXT NOT NULL UNIQUE,         -- Google's stable user identifier
  email           TEXT NOT NULL,
  name            TEXT,
  picture_url     TEXT,
  timezone        TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);
CREATE INDEX idx_users_google_sub ON users(google_sub);

-- Tag every existing data row with a user_id. Tables created in 0001/0002
-- get a new column; new inserts must provide it.
ALTER TABLE workouts ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE meals    ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE logs     ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE targets  ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_workouts_user_done ON workouts(user_id, done_on DESC);
CREATE INDEX idx_meals_user_eaten   ON meals(user_id, eaten_on DESC);
CREATE INDEX idx_logs_user_recorded ON logs(user_id, recorded_on DESC);
CREATE INDEX idx_targets_user_active ON targets(user_id, kind, deactivated_at);
