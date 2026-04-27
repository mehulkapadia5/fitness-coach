// Cross-user queries for the admin dashboard. These deliberately skip
// the user_id filter — the dashboard is for *you*, the admin, looking
// across all users.

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  timezone: string;
  created_at: string;
  last_login_at: string | null;
  workouts_count: number;
  meals_count: number;
  logs_count: number;
  targets_count: number;
}

export async function listUsers(db: D1Database): Promise<UserSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.picture_url,
         u.timezone,
         u.created_at,
         u.last_login_at,
         (SELECT COUNT(*) FROM workouts w WHERE w.user_id = u.id) AS workouts_count,
         (SELECT COUNT(*) FROM meals m    WHERE m.user_id = u.id) AS meals_count,
         (SELECT COUNT(*) FROM logs l     WHERE l.user_id = u.id) AS logs_count,
         (SELECT COUNT(*) FROM targets t  WHERE t.user_id = u.id) AS targets_count
       FROM users u
       ORDER BY COALESCE(u.last_login_at, u.created_at) DESC`,
    )
    .all<UserSummary>();
  return results ?? [];
}

export interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  timezone: string;
  google_sub: string;
  created_at: string;
  last_login_at: string | null;
}

export async function getUserDetail(
  db: D1Database,
  userId: string,
): Promise<UserDetail | null> {
  return db
    .prepare(
      `SELECT id, email, name, picture_url, timezone, google_sub, created_at, last_login_at
         FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<UserDetail>();
}

export interface ActivityRow {
  user_id: string;
  user_email: string;
  user_name: string | null;
  source: 'workout' | 'meal' | 'log' | 'target';
  ts: string; // UTC ISO when the row was created
  summary: string; // human-readable one-line description
}

/**
 * Recent activity feed across all users — last N rows from the four
 * data tables, joined with user info, sorted by time desc.
 *
 * SQLite requires each per-table ORDER BY / LIMIT to live inside a
 * subquery (you can't put them on a SELECT that is itself a branch of
 * UNION ALL — the parser treats trailing ORDER BY as belonging to the
 * whole compound select). So each branch is wrapped in `SELECT * FROM
 * (... ORDER BY ... LIMIT ...)`.
 */
export async function recentActivity(
  db: D1Database,
  limit: number,
): Promise<ActivityRow[]> {
  const sql = `
    SELECT user_id, user_email, user_name, source, ts, summary FROM (
      SELECT
        w.user_id,
        u.email AS user_email,
        u.name  AS user_name,
        'workout' AS source,
        w.done_at AS ts,
        ('Workout: ' || w.type ||
          CASE WHEN w.intensity IS NOT NULL THEN ' (' || w.intensity || ')' ELSE '' END ||
          CASE WHEN w.duration_min IS NOT NULL THEN ' ' || w.duration_min || 'min' ELSE '' END
        ) AS summary
      FROM workouts w JOIN users u ON u.id = w.user_id
      ORDER BY w.done_at DESC LIMIT ?
    )
    UNION ALL
    SELECT user_id, user_email, user_name, source, ts, summary FROM (
      SELECT
        m.user_id, u.email AS user_email, u.name AS user_name,
        'meal' AS source, m.eaten_at AS ts,
        ('Meal: ' || m.description ||
          CASE WHEN m.protein_g IS NOT NULL THEN ' (' || m.protein_g || 'g protein)' ELSE '' END
        ) AS summary
      FROM meals m JOIN users u ON u.id = m.user_id
      ORDER BY m.eaten_at DESC LIMIT ?
    )
    UNION ALL
    SELECT user_id, user_email, user_name, source, ts, summary FROM (
      SELECT
        l.user_id, u.email AS user_email, u.name AS user_name,
        'log' AS source, l.recorded_at AS ts,
        ('Log: ' || l.kind || '=' || l.value) AS summary
      FROM logs l JOIN users u ON u.id = l.user_id
      ORDER BY l.recorded_at DESC LIMIT ?
    )
    UNION ALL
    SELECT user_id, user_email, user_name, source, ts, summary FROM (
      SELECT
        t.user_id, u.email AS user_email, u.name AS user_name,
        'target' AS source, t.set_at AS ts,
        ('Target: ' || t.kind || ' ' || t.comparison || ' ' || t.target_value || t.unit ||
          ' (' || t.period || ')'
        ) AS summary
      FROM targets t JOIN users u ON u.id = t.user_id
      ORDER BY t.set_at DESC LIMIT ?
    )
    ORDER BY ts DESC
    LIMIT ?
  `;
  const { results } = await db
    .prepare(sql)
    .bind(limit, limit, limit, limit, limit)
    .all<ActivityRow>();
  return results ?? [];
}

export interface ToolCallSummary {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  tool_name: string;
  args_json: string | null;
  result_text: string | null;
  duration_ms: number;
  error: string | null;
  called_at: string;
}

export async function recentToolCallsForUser(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<ToolCallSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT tc.id, tc.user_id, u.email AS user_email, u.name AS user_name,
              tc.tool_name, tc.args_json, tc.result_text, tc.duration_ms,
              tc.error, tc.called_at
         FROM tool_calls tc
         JOIN users u ON u.id = tc.user_id
        WHERE tc.user_id = ?
        ORDER BY tc.called_at DESC
        LIMIT ?`,
    )
    .bind(userId, limit)
    .all<ToolCallSummary>();
  return results ?? [];
}

export async function recentToolCallsAll(
  db: D1Database,
  limit: number,
): Promise<ToolCallSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT tc.id, tc.user_id, u.email AS user_email, u.name AS user_name,
              tc.tool_name, tc.args_json, tc.result_text, tc.duration_ms,
              tc.error, tc.called_at
         FROM tool_calls tc
         JOIN users u ON u.id = tc.user_id
        ORDER BY tc.called_at DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<ToolCallSummary>();
  return results ?? [];
}

export interface UserData {
  workouts: Array<{
    id: string;
    done_on: string;
    done_at: string;
    type: string;
    intensity: string | null;
    duration_min: number | null;
    notes: string | null;
  }>;
  meals: Array<{
    id: string;
    eaten_on: string;
    eaten_at: string;
    description: string;
    protein_g: number | null;
    calories_kcal: number | null;
    notes: string | null;
  }>;
  logs: Array<{
    id: string;
    recorded_on: string;
    recorded_at: string;
    kind: string;
    value: string;
  }>;
  targets: Array<{
    id: string;
    kind: string;
    target_value: number;
    unit: string;
    period: string;
    comparison: string;
    set_on: string;
    deactivated_at: string | null;
    notes: string | null;
  }>;
}

export async function getUserData(
  db: D1Database,
  userId: string,
  limitPerTable: number,
): Promise<UserData> {
  const [workouts, meals, logs, targets] = await Promise.all([
    db
      .prepare(
        `SELECT id, done_on, done_at, type, intensity, duration_min, notes
           FROM workouts WHERE user_id = ?
           ORDER BY done_at DESC LIMIT ?`,
      )
      .bind(userId, limitPerTable)
      .all<UserData['workouts'][number]>(),
    db
      .prepare(
        `SELECT id, eaten_on, eaten_at, description, protein_g, calories_kcal, notes
           FROM meals WHERE user_id = ?
           ORDER BY eaten_at DESC LIMIT ?`,
      )
      .bind(userId, limitPerTable)
      .all<UserData['meals'][number]>(),
    db
      .prepare(
        `SELECT id, recorded_on, recorded_at, kind, value
           FROM logs WHERE user_id = ?
           ORDER BY recorded_at DESC LIMIT ?`,
      )
      .bind(userId, limitPerTable)
      .all<UserData['logs'][number]>(),
    db
      .prepare(
        `SELECT id, kind, target_value, unit, period, comparison, set_on, deactivated_at, notes
           FROM targets WHERE user_id = ?
           ORDER BY set_at DESC LIMIT ?`,
      )
      .bind(userId, limitPerTable)
      .all<UserData['targets'][number]>(),
  ]);
  return {
    workouts: workouts.results ?? [],
    meals: meals.results ?? [],
    logs: logs.results ?? [],
    targets: targets.results ?? [],
  };
}

export async function totalCounts(db: D1Database): Promise<{
  users: number;
  workouts: number;
  meals: number;
  logs: number;
  targets: number;
  tool_calls: number;
}> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users)      AS users,
         (SELECT COUNT(*) FROM workouts)   AS workouts,
         (SELECT COUNT(*) FROM meals)      AS meals,
         (SELECT COUNT(*) FROM logs)       AS logs,
         (SELECT COUNT(*) FROM targets)    AS targets,
         (SELECT COUNT(*) FROM tool_calls) AS tool_calls`,
    )
    .first<{
      users: number;
      workouts: number;
      meals: number;
      logs: number;
      targets: number;
      tool_calls: number;
    }>();
  return (
    row ?? {
      users: 0,
      workouts: 0,
      meals: 0,
      logs: 0,
      targets: 0,
      tool_calls: 0,
    }
  );
}
