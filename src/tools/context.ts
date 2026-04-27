import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  activeTargets,
  countWorkoutsBetween,
  logsBetween,
  logsOn,
  mealsOn,
  sumMealField,
  type TargetRow,
  todaySleepHours,
  workoutsSince,
} from '../db.js';
import {
  daysAgoIST,
  istDateString,
  istDayOfWeek,
  istTimeString,
} from '../time.js';

const description =
  'Call this FIRST in every conversation, before responding to any question about workouts, meals, today, yesterday, or "what should I do." Returns today\'s IST date, day of week, current IST time, the last 7 days of workouts, today\'s meals, recent notes, AND any active targets with current progress (calories, protein, workouts/week, sleep, etc.). Cheap and idempotent — call again any time you\'re uncertain about state. If you skip this, you will give wrong advice about what day it is, what the user did recently, or how they\'re tracking against their goals.';

interface TargetWithProgress {
  kind: string;
  target: number;
  unit: string;
  period: TargetRow['period'];
  comparison: TargetRow['comparison'];
  set_on: string;
  notes: string | null;
  current_value: number | null;
  remaining: number | null;
}

async function computeTargetProgress(
  db: D1Database,
  target: TargetRow,
  today: string,
): Promise<TargetWithProgress> {
  let current: number | null = null;

  // Auto-progress for the four well-known kinds. Anything else is stored
  // and surfaced verbatim (current_value=null) so Claude can still factor
  // it in qualitatively.
  if (target.kind === 'protein_g' && target.period === 'daily') {
    current = await sumMealField(db, 'protein_g', today);
  } else if (target.kind === 'calories_kcal' && target.period === 'daily') {
    current = await sumMealField(db, 'calories_kcal', today);
  } else if (
    target.kind === 'workouts_per_week' &&
    target.period === 'weekly'
  ) {
    // Last 7 IST days inclusive of today.
    current = await countWorkoutsBetween(db, daysAgoIST(6), today);
  } else if (target.kind === 'sleep_hours' && target.period === 'daily') {
    current = await todaySleepHours(db, today);
  }

  let remaining: number | null = null;
  if (current != null) {
    if (target.comparison === 'gte') {
      remaining = Math.max(0, target.target_value - current);
    } else if (target.comparison === 'lte') {
      // Headroom: how much you can still consume before hitting the cap.
      remaining = target.target_value - current;
    } else {
      remaining = target.target_value - current;
    }
  }

  return {
    kind: target.kind,
    target: target.target_value,
    unit: target.unit,
    period: target.period,
    comparison: target.comparison,
    set_on: target.set_on,
    notes: target.notes,
    current_value: current,
    remaining,
  };
}

export function registerGetContext(
  server: McpServer,
  getDB: () => D1Database,
): void {
  server.registerTool(
    'get_context',
    {
      description,
      annotations: {
        title: "Get today's IST date, time, recent activity, and active targets",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {},
    },
    async () => {
      const db = getDB();
      const today = istDateString();

      const [workouts, todayMeals, todayLogs, recentLogs, targets] =
        await Promise.all([
          workoutsSince(db, 7),
          mealsOn(db, today),
          logsOn(db, today),
          logsBetween(db, daysAgoIST(7), today, 5),
          activeTargets(db),
        ]);

      const last_7_days_workouts = workouts.map((w) => ({
        date: w.done_on,
        day: istDayOfWeek(new Date(w.done_at)),
        type: w.type,
        intensity: w.intensity,
        duration_min: w.duration_min,
        notes: w.notes,
      }));

      const today_meals = todayMeals.map((m) => ({
        time: istTimeString(new Date(m.eaten_at)),
        description: m.description,
        protein_g: m.protein_g,
        calories_kcal: m.calories_kcal,
        notes: m.notes,
      }));

      const today_logs = todayLogs.map((l) => ({
        time: istTimeString(new Date(l.recorded_at)),
        kind: l.kind,
        value: l.value,
      }));

      const recent_notes = recentLogs.map((l) => ({
        date: l.recorded_on,
        kind: l.kind,
        value: l.value,
      }));

      const active_targets = await Promise.all(
        targets.map((t) => computeTargetProgress(db, t, today)),
      );

      const payload = {
        today,
        today_day_of_week: istDayOfWeek(),
        current_time_ist: istTimeString(),
        timezone: 'Asia/Kolkata (IST, UTC+5:30)',
        active_targets,
        last_7_days_workouts,
        today_meals,
        today_logs,
        recent_notes,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
