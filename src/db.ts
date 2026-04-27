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

export interface WorkoutRow {
  id: string;
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
  recorded_on: string;
  recorded_at: string;
  kind: string;
  value: string;
  created_at: string;
}

export type TableName = 'workouts' | 'meals' | 'logs' | 'targets';

function newId(): string {
  return crypto.randomUUID();
}

export async function insertWorkout(
  db: D1Database,
  args: {
    type: WorkoutType;
    intensity?: Intensity;
    duration_min?: number;
    notes?: string;
    done_on?: string; // YYYY-MM-DD in IST; defaults to today IST
  },
): Promise<WorkoutRow> {
  const id = newId();
  const done_at = nowUTCISO();
  const done_on = args.done_on ?? istDateString();
  await db
    .prepare(
      `INSERT INTO workouts (id, done_on, done_at, type, intensity, duration_min, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
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
    done_on,
    done_at,
    type: args.type,
    intensity: args.intensity ?? null,
    duration_min: args.duration_min ?? null,
    notes: args.notes ?? null,
    created_at: done_at,
  };
}

export async function insertMeal(
  db: D1Database,
  args: {
    description: string;
    protein_g?: number;
    calories_kcal?: number;
    notes?: string;
    eaten_at?: string; // ISO-8601 UTC; defaults to now
  },
): Promise<MealRow> {
  const id = newId();
  const eaten_at = args.eaten_at ?? nowUTCISO();
  const eaten_on = istDateString(new Date(eaten_at));
  await db
    .prepare(
      `INSERT INTO meals (id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
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
    eaten_on,
    eaten_at,
    description: args.description,
    protein_g: args.protein_g ?? null,
    calories_kcal: args.calories_kcal ?? null,
    notes: args.notes ?? null,
    created_at: eaten_at,
  };
}

export async function insertLog(
  db: D1Database,
  args: {
    kind: string;
    value: string;
    recorded_at?: string; // ISO-8601 UTC; defaults to now
  },
): Promise<LogRow> {
  const id = newId();
  const recorded_at = args.recorded_at ?? nowUTCISO();
  const recorded_on = istDateString(new Date(recorded_at));
  await db
    .prepare(
      `INSERT INTO logs (id, recorded_on, recorded_at, kind, value)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, recorded_on, recorded_at, args.kind, args.value)
    .run();
  return {
    id,
    recorded_on,
    recorded_at,
    kind: args.kind,
    value: args.value,
    created_at: recorded_at,
  };
}

export async function workoutsSince(
  db: D1Database,
  daysBack: number,
): Promise<WorkoutRow[]> {
  const since = daysAgoIST(daysBack);
  const { results } = await db
    .prepare(
      `SELECT id, done_on, done_at, type, intensity, duration_min, notes, created_at
         FROM workouts
        WHERE done_on >= ?
        ORDER BY done_on DESC, done_at DESC`,
    )
    .bind(since)
    .all<WorkoutRow>();
  return results ?? [];
}

export async function mealsOn(
  db: D1Database,
  dateISO: string,
): Promise<MealRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes, created_at
         FROM meals
        WHERE eaten_on = ?
        ORDER BY eaten_at ASC`,
    )
    .bind(dateISO)
    .all<MealRow>();
  return results ?? [];
}

export async function mealsSince(
  db: D1Database,
  daysBack: number,
): Promise<MealRow[]> {
  const since = daysAgoIST(daysBack);
  const { results } = await db
    .prepare(
      `SELECT id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes, created_at
         FROM meals
        WHERE eaten_on >= ?
        ORDER BY eaten_on DESC, eaten_at DESC`,
    )
    .bind(since)
    .all<MealRow>();
  return results ?? [];
}

export async function logsOn(
  db: D1Database,
  dateISO: string,
): Promise<LogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, recorded_on, recorded_at, kind, value, created_at
         FROM logs
        WHERE recorded_on = ?
        ORDER BY recorded_at ASC`,
    )
    .bind(dateISO)
    .all<LogRow>();
  return results ?? [];
}

export async function logsBetween(
  db: D1Database,
  fromDate: string,
  toDateExclusive: string,
  limit: number,
): Promise<LogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, recorded_on, recorded_at, kind, value, created_at
         FROM logs
        WHERE recorded_on >= ? AND recorded_on < ?
        ORDER BY recorded_on DESC, recorded_at DESC
        LIMIT ?`,
    )
    .bind(fromDate, toDateExclusive, limit)
    .all<LogRow>();
  return results ?? [];
}

export async function logsSince(
  db: D1Database,
  daysBack: number,
): Promise<LogRow[]> {
  const since = daysAgoIST(daysBack);
  const { results } = await db
    .prepare(
      `SELECT id, recorded_on, recorded_at, kind, value, created_at
         FROM logs
        WHERE recorded_on >= ?
        ORDER BY recorded_on DESC, recorded_at DESC`,
    )
    .bind(since)
    .all<LogRow>();
  return results ?? [];
}

const TARGET_COLS =
  'id, kind, target_value, unit, period, comparison, set_on, set_at, deactivated_at, notes, created_at';

export async function activeTargets(db: D1Database): Promise<TargetRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TARGET_COLS}
         FROM targets
        WHERE deactivated_at IS NULL
        ORDER BY set_at DESC`,
    )
    .all<TargetRow>();
  return results ?? [];
}

export async function setTarget(
  db: D1Database,
  args: {
    kind: string;
    target_value: number;
    unit: string;
    period: TargetPeriod;
    comparison: TargetComparison;
    notes?: string;
  },
): Promise<TargetRow> {
  const id = newId();
  const set_at = nowUTCISO();
  const set_on = istDateString();

  // Soft-delete any currently active target with the same kind so the
  // newest one becomes the live one. History stays queryable.
  await db
    .prepare(
      `UPDATE targets
          SET deactivated_at = ?
        WHERE kind = ? AND deactivated_at IS NULL`,
    )
    .bind(set_at, args.kind)
    .run();

  await db
    .prepare(
      `INSERT INTO targets (id, kind, target_value, unit, period, comparison, set_on, set_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
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
  kind: string,
): Promise<number> {
  const now = nowUTCISO();
  const res = await db
    .prepare(
      `UPDATE targets
          SET deactivated_at = ?
        WHERE kind = ? AND deactivated_at IS NULL`,
    )
    .bind(now, kind)
    .run();
  return res.meta.changes ?? 0;
}

export async function targetsSince(
  db: D1Database,
  daysBack: number,
): Promise<TargetRow[]> {
  const since = daysAgoIST(daysBack);
  const { results } = await db
    .prepare(
      `SELECT ${TARGET_COLS}
         FROM targets
        WHERE set_on >= ?
        ORDER BY set_at DESC`,
    )
    .bind(since)
    .all<TargetRow>();
  return results ?? [];
}

export async function sumMealField(
  db: D1Database,
  field: 'protein_g' | 'calories_kcal',
  dateISO: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(${field}), 0) AS total
         FROM meals
        WHERE eaten_on = ?`,
    )
    .bind(dateISO)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function countWorkoutsBetween(
  db: D1Database,
  fromDateInclusive: string,
  toDateInclusive: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM workouts
        WHERE done_on >= ? AND done_on <= ?
          AND type != 'rest'`,
    )
    .bind(fromDateInclusive, toDateInclusive)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function todaySleepHours(
  db: D1Database,
  dateISO: string,
): Promise<number | null> {
  // Convention: when Claude logs sleep, it stores the hour count as the
  // value (e.g. kind='sleep', value='7.5'). If no parseable number is
  // found we return null and let `get_context` show the target without
  // progress.
  const { results } = await db
    .prepare(
      `SELECT value FROM logs
        WHERE recorded_on = ? AND kind = 'sleep'
        ORDER BY recorded_at DESC`,
    )
    .bind(dateISO)
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
