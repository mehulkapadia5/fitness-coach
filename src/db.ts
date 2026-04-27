import { daysAgoIST, istDateString, nowUTCISO } from './time.js';

export type WorkoutType =
  | 'push'
  | 'pull'
  | 'legs'
  | 'run'
  | 'walk'
  | 'rest'
  | 'mixed'
  | 'other';

export type Intensity = 'light' | 'moderate' | 'heavy';

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  timezone: string;
  created_at: string;
  last_login_at: string | null;
}

export interface WorkoutRow {
  id: string;
  user_id: string;
  done_on: string;
  done_at: string;
  type: WorkoutType;
  intensity: Intensity | null;
  duration_min: number | null;
  notes: string | null;
  created_at: string;
}

export interface MealRow {
  id: string;
  user_id: string;
  eaten_on: string;
  eaten_at: string;
  description: string;
  protein_g: number | null;
  calories_kcal: number | null;
  notes: string | null;
  created_at: string;
}

export type TargetPeriod = 'daily' | 'weekly' | 'by_date' | 'ongoing';
export type TargetComparison = 'gte' | 'lte' | 'eq';

export interface TargetRow {
  id: string;
  user_id: string;
  kind: string;
  target_value: number;
  unit: string;
  period: TargetPeriod;
  comparison: TargetComparison;
  set_on: string;
  set_at: string;
  deactivated_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface LogRow {
  id: string;
  user_id: string;
  recorded_on: string;
  recorded_at: string;
  kind: string;
  value: string;
  created_at: string;
}

export type TableName = 'workouts' | 'meals' | 'logs' | 'targets';

export interface ToolCallRow {
  id: string;
  user_id: string;
  tool_name: string;
  args_json: string | null;
  result_text: string | null;
  duration_ms: number;
  error: string | null;
  called_at: string;
  created_at: string;
}

function newId(): string {
  return crypto.randomUUID();
}

const FIELD_TRUNCATE_BYTES = 4_096;

function truncateForDb(s: string | null | undefined): string | null {
  if (s == null) return null;
  if (s.length <= FIELD_TRUNCATE_BYTES) return s;
  return s.slice(0, FIELD_TRUNCATE_BYTES) + ' […truncated]';
}

/**
 * Persist a tool invocation. Called from the registerTool wrapper in
 * mcp.ts — every tool call passes through here regardless of whether
 * it succeeded or threw.
 */
export async function logToolCall(
  db: D1Database,
  args: {
    userId: string;
    toolName: string;
    args: unknown;
    resultText: string | null;
    durationMs: number;
    error: string | null;
  },
): Promise<void> {
  const id = newId();
  const calledAt = nowUTCISO();
  let argsJson: string | null = null;
  try {
    argsJson = JSON.stringify(args.args);
  } catch {
    argsJson = null;
  }
  await db
    .prepare(
      `INSERT INTO tool_calls (id, user_id, tool_name, args_json, result_text, duration_ms, error, called_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      args.userId,
      args.toolName,
      truncateForDb(argsJson),
      truncateForDb(args.resultText),
      args.durationMs,
      args.error,
      calledAt,
    )
    .run();
}

// =============================================================================
// USERS
// =============================================================================

/**
 * Find an existing user by their Google `sub` (stable user identifier) or
 * create a new one. Updates last_login_at every call.
 */
export async function upsertUserByGoogle(
  db: D1Database,
  args: {
    google_sub: string;
    email: string;
    name?: string;
    picture_url?: string;
    timezone?: string;
  },
): Promise<UserRow> {
  const now = nowUTCISO();
  const existing = await db
    .prepare(
      `SELECT id, google_sub, email, name, picture_url, timezone, created_at, last_login_at
         FROM users WHERE google_sub = ?`,
    )
    .bind(args.google_sub)
    .first<UserRow>();

  if (existing) {
    // Update mutable fields + last_login_at, keep id stable.
    await db
      .prepare(
        `UPDATE users
            SET email = ?, name = ?, picture_url = ?, last_login_at = ?
          WHERE id = ?`,
      )
      .bind(
        args.email,
        args.name ?? existing.name,
        args.picture_url ?? existing.picture_url,
        now,
        existing.id,
      )
      .run();
    return {
      ...existing,
      email: args.email,
      name: args.name ?? existing.name,
      picture_url: args.picture_url ?? existing.picture_url,
      last_login_at: now,
    };
  }

  const id = newId();
  const timezone = args.timezone ?? 'Asia/Kolkata';
  await db
    .prepare(
      `INSERT INTO users (id, google_sub, email, name, picture_url, timezone, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      args.google_sub,
      args.email,
      args.name ?? null,
      args.picture_url ?? null,
      timezone,
      now,
    )
    .run();
  return {
    id,
    google_sub: args.google_sub,
    email: args.email,
    name: args.name ?? null,
    picture_url: args.picture_url ?? null,
    timezone,
    created_at: now,
    last_login_at: now,
  };
}

export async function getUser(
  db: D1Database,
  userId: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT id, google_sub, email, name, picture_url, timezone, created_at, last_login_at
         FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<UserRow>();
}

// =============================================================================
// WORKOUTS
// =============================================================================

export async function insertWorkout(
  db: D1Database,
  userId: string,
  args: {
    type: WorkoutType;
    intensity?: Intensity;
    duration_min?: number;
    notes?: string;
    done_on?: string; // YYYY-MM-DD in user's timezone; defaults to today
    timezone?: string; // for resolving the default done_on
  },
): Promise<WorkoutRow> {
  const id = newId();
  const done_at = nowUTCISO();
  const done_on = args.done_on ?? istDateString(new Date(), args.timezone);
  await db
    .prepare(
      `INSERT INTO workouts (id, user_id, done_on, done_at, type, intensity, duration_min, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      done_on,
      done_at,
      args.type,
      args.intensity ?? null,
      args.duration_min ?? null,
      args.notes ?? null,
    )
    .run();
  return {
    id,
    user_id: userId,
    done_on,
    done_at,
    type: args.type,
    intensity: args.intensity ?? null,
    duration_min: args.duration_min ?? null,
    notes: args.notes ?? null,
    created_at: done_at,
  };
}

export async function workoutsSince(
  db: D1Database,
  userId: string,
  daysBack: number,
  timezone?: string,
): Promise<WorkoutRow[]> {
  const since = daysAgoIST(daysBack, timezone);
  const { results } = await db
    .prepare(
      `SELECT id, user_id, done_on, done_at, type, intensity, duration_min, notes, created_at
         FROM workouts
        WHERE user_id = ? AND done_on >= ?
        ORDER BY done_on DESC, done_at DESC`,
    )
    .bind(userId, since)
    .all<WorkoutRow>();
  return results ?? [];
}

// =============================================================================
// MEALS
// =============================================================================

export async function insertMeal(
  db: D1Database,
  userId: string,
  args: {
    description: string;
    protein_g?: number;
    calories_kcal?: number;
    notes?: string;
    eaten_at?: string;
    timezone?: string;
  },
): Promise<MealRow> {
  const id = newId();
  const eaten_at = args.eaten_at ?? nowUTCISO();
  const eaten_on = istDateString(new Date(eaten_at), args.timezone);
  await db
    .prepare(
      `INSERT INTO meals (id, user_id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      eaten_on,
      eaten_at,
      args.description,
      args.protein_g ?? null,
      args.calories_kcal ?? null,
      args.notes ?? null,
    )
    .run();
  return {
    id,
    user_id: userId,
    eaten_on,
    eaten_at,
    description: args.description,
    protein_g: args.protein_g ?? null,
    calories_kcal: args.calories_kcal ?? null,
    notes: args.notes ?? null,
    created_at: eaten_at,
  };
}

export async function mealsOn(
  db: D1Database,
  userId: string,
  dateISO: string,
): Promise<MealRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes, created_at
         FROM meals
        WHERE user_id = ? AND eaten_on = ?
        ORDER BY eaten_at ASC`,
    )
    .bind(userId, dateISO)
    .all<MealRow>();
  return results ?? [];
}

export async function mealsSince(
  db: D1Database,
  userId: string,
  daysBack: number,
  timezone?: string,
): Promise<MealRow[]> {
  const since = daysAgoIST(daysBack, timezone);
  const { results } = await db
    .prepare(
      `SELECT id, user_id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes, created_at
         FROM meals
        WHERE user_id = ? AND eaten_on >= ?
        ORDER BY eaten_on DESC, eaten_at DESC`,
    )
    .bind(userId, since)
    .all<MealRow>();
  return results ?? [];
}

// =============================================================================
// LOGS
// =============================================================================

export async function insertLog(
  db: D1Database,
  userId: string,
  args: {
    kind: string;
    value: string;
    recorded_at?: string;
    timezone?: string;
  },
): Promise<LogRow> {
  const id = newId();
  const recorded_at = args.recorded_at ?? nowUTCISO();
  const recorded_on = istDateString(new Date(recorded_at), args.timezone);
  await db
    .prepare(
      `INSERT INTO logs (id, user_id, recorded_on, recorded_at, kind, value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, recorded_on, recorded_at, args.kind, args.value)
    .run();
  return {
    id,
    user_id: userId,
    recorded_on,
    recorded_at,
    kind: args.kind,
    value: args.value,
    created_at: recorded_at,
  };
}

export async function logsOn(
  db: D1Database,
  userId: string,
  dateISO: string,
): Promise<LogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, recorded_on, recorded_at, kind, value, created_at
         FROM logs
        WHERE user_id = ? AND recorded_on = ?
        ORDER BY recorded_at ASC`,
    )
    .bind(userId, dateISO)
    .all<LogRow>();
  return results ?? [];
}

export async function logsBetween(
  db: D1Database,
  userId: string,
  fromDate: string,
  toDateExclusive: string,
  limit: number,
): Promise<LogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, recorded_on, recorded_at, kind, value, created_at
         FROM logs
        WHERE user_id = ? AND recorded_on >= ? AND recorded_on < ?
        ORDER BY recorded_on DESC, recorded_at DESC
        LIMIT ?`,
    )
    .bind(userId, fromDate, toDateExclusive, limit)
    .all<LogRow>();
  return results ?? [];
}

export async function logsSince(
  db: D1Database,
  userId: string,
  daysBack: number,
  timezone?: string,
): Promise<LogRow[]> {
  const since = daysAgoIST(daysBack, timezone);
  const { results } = await db
    .prepare(
      `SELECT id, user_id, recorded_on, recorded_at, kind, value, created_at
         FROM logs
        WHERE user_id = ? AND recorded_on >= ?
        ORDER BY recorded_on DESC, recorded_at DESC`,
    )
    .bind(userId, since)
    .all<LogRow>();
  return results ?? [];
}

// =============================================================================
// TARGETS
// =============================================================================

const TARGET_COLS =
  'id, user_id, kind, target_value, unit, period, comparison, set_on, set_at, deactivated_at, notes, created_at';

export async function activeTargets(
  db: D1Database,
  userId: string,
): Promise<TargetRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TARGET_COLS}
         FROM targets
        WHERE user_id = ? AND deactivated_at IS NULL
        ORDER BY set_at DESC`,
    )
    .bind(userId)
    .all<TargetRow>();
  return results ?? [];
}

export async function setTarget(
  db: D1Database,
  userId: string,
  args: {
    kind: string;
    target_value: number;
    unit: string;
    period: TargetPeriod;
    comparison: TargetComparison;
    notes?: string;
    timezone?: string;
  },
): Promise<TargetRow> {
  const id = newId();
  const set_at = nowUTCISO();
  const set_on = istDateString(new Date(), args.timezone);

  // Soft-delete only this user's currently-active target with the same kind.
  await db
    .prepare(
      `UPDATE targets
          SET deactivated_at = ?
        WHERE user_id = ? AND kind = ? AND deactivated_at IS NULL`,
    )
    .bind(set_at, userId, args.kind)
    .run();

  await db
    .prepare(
      `INSERT INTO targets (id, user_id, kind, target_value, unit, period, comparison, set_on, set_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      args.kind,
      args.target_value,
      args.unit,
      args.period,
      args.comparison,
      set_on,
      set_at,
      args.notes ?? null,
    )
    .run();

  return {
    id,
    user_id: userId,
    kind: args.kind,
    target_value: args.target_value,
    unit: args.unit,
    period: args.period,
    comparison: args.comparison,
    set_on,
    set_at,
    deactivated_at: null,
    notes: args.notes ?? null,
    created_at: set_at,
  };
}

export async function clearTarget(
  db: D1Database,
  userId: string,
  kind: string,
): Promise<number> {
  const now = nowUTCISO();
  const res = await db
    .prepare(
      `UPDATE targets
          SET deactivated_at = ?
        WHERE user_id = ? AND kind = ? AND deactivated_at IS NULL`,
    )
    .bind(now, userId, kind)
    .run();
  return res.meta.changes ?? 0;
}

export async function targetsSince(
  db: D1Database,
  userId: string,
  daysBack: number,
  timezone?: string,
): Promise<TargetRow[]> {
  const since = daysAgoIST(daysBack, timezone);
  const { results } = await db
    .prepare(
      `SELECT ${TARGET_COLS}
         FROM targets
        WHERE user_id = ? AND set_on >= ?
        ORDER BY set_at DESC`,
    )
    .bind(userId, since)
    .all<TargetRow>();
  return results ?? [];
}

// =============================================================================
// AGGREGATES (used by get_context for target progress)
// =============================================================================

export async function sumMealField(
  db: D1Database,
  userId: string,
  field: 'protein_g' | 'calories_kcal',
  dateISO: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(${field}), 0) AS total
         FROM meals
        WHERE user_id = ? AND eaten_on = ?`,
    )
    .bind(userId, dateISO)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function countWorkoutsBetween(
  db: D1Database,
  userId: string,
  fromDateInclusive: string,
  toDateInclusive: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM workouts
        WHERE user_id = ? AND done_on >= ? AND done_on <= ?
          AND type != 'rest'`,
    )
    .bind(userId, fromDateInclusive, toDateInclusive)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function todaySleepHours(
  db: D1Database,
  userId: string,
  dateISO: string,
): Promise<number | null> {
  const { results } = await db
    .prepare(
      `SELECT value FROM logs
        WHERE user_id = ? AND recorded_on = ? AND kind = 'sleep'
        ORDER BY recorded_at DESC`,
    )
    .bind(userId, dateISO)
    .all<{ value: string }>();
  if (!results || results.length === 0) return null;
  let total = 0;
  let hadValid = false;
  for (const r of results) {
    const n = Number.parseFloat(r.value);
    if (Number.isFinite(n)) {
      total += n;
      hadValid = true;
    }
  }
  return hadValid ? total : null;
}
