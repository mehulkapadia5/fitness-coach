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
import type { UserContext } from './types.js';

const description =
  'Call this FIRST in every conversation, before responding to any question about workouts, meals, today, yesterday, or "what should I do." Returns the user\'s local date, day of week, current local time, the last 7 days of workouts, today\'s meals, recent notes, AND any active targets with current progress (calories, protein, workouts/week, sleep, etc.). Cheap and idempotent — call again any time you\'re uncertain about state. If you skip this, you will give wrong advice about what day it is, what the user did recently, or how they\'re tracking against their goals.';

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
  ctx: UserContext,
  target: TargetRow,
  today: string,
): Promise<TargetWithProgress> {
  let current: number | null = null;

  if (target.kind === 'protein_g' && target.period === 'daily') {
    current = await sumMealField(ctx.db, ctx.userId, 'protein_g', today);
  } else if (target.kind === 'calories_kcal' && target.period === 'daily') {
    current = await sumMealField(ctx.db, ctx.userId, 'calories_kcal', today);
  } else if (target.kind === 'carbs_g' && target.period === 'daily') {
    current = await sumMealField(ctx.db, ctx.userId, 'carbs_g', today);
  } else if (target.kind === 'fat_g' && target.period === 'daily') {
    current = await sumMealField(ctx.db, ctx.userId, 'fat_g', today);
  } else if (
    target.kind === 'workouts_per_week' &&
    target.period === 'weekly'
  ) {
    current = await countWorkoutsBetween(
      ctx.db,
      ctx.userId,
      daysAgoIST(6, ctx.timezone),
      today,
    );
  } else if (target.kind === 'sleep_hours' && target.period === 'daily') {
    current = await todaySleepHours(ctx.db, ctx.userId, today);
  }

  let remaining: number | null = null;
  if (current != null) {
    if (target.comparison === 'gte') {
      remaining = Math.max(0, target.target_value - current);
    } else if (target.comparison === 'lte') {
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
  ctx: UserContext,
): void {
  server.registerTool(
    'get_context',
    {
      description,
      annotations: {
        title:
          "Get today's local date, time, recent activity, and active targets",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {},
    },
    async () => {
      const today = istDateString(new Date(), ctx.timezone);

      const [workouts, todayMeals, todayLogs, recentLogs, targets] =
        await Promise.all([
          workoutsSince(ctx.db, ctx.userId, 7, ctx.timezone),
          mealsOn(ctx.db, ctx.userId, today),
          logsOn(ctx.db, ctx.userId, today),
          logsBetween(
            ctx.db,
            ctx.userId,
            daysAgoIST(7, ctx.timezone),
            today,
            5,
          ),
          activeTargets(ctx.db, ctx.userId),
        ]);

      const active_targets = await Promise.all(
        targets.map((t) => computeTargetProgress(ctx, t, today)),
      );

      const payload = {
        user: ctx.userDisplayName,
        today,
        today_day_of_week: istDayOfWeek(new Date(), ctx.timezone),
        current_time_local: istTimeString(new Date(), ctx.timezone),
        timezone: ctx.timezone,
        active_targets,
        last_7_days_workouts: workouts.map((w) => ({
          date: w.done_on,
          day: istDayOfWeek(new Date(w.done_at), ctx.timezone),
          type: w.type,
          intensity: w.intensity,
          duration_min: w.duration_min,
          notes: w.notes,
        })),
        today_meals: todayMeals.map((m) => ({
          time: istTimeString(new Date(m.eaten_at), ctx.timezone),
          description: m.description,
          portion_assumed: m.portion_assumed,
          calories_kcal: m.calories_kcal,
          protein_g: m.protein_g,
          carbs_g: m.carbs_g,
          fat_g: m.fat_g,
          notes: m.notes,
        })),
        today_logs: todayLogs.map((l) => ({
          time: istTimeString(new Date(l.recorded_at), ctx.timezone),
          kind: l.kind,
          value: l.value,
        })),
        recent_notes: recentLogs.map((l) => ({
          date: l.recorded_on,
          kind: l.kind,
          value: l.value,
        })),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
