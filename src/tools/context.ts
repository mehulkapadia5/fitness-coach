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
import { URI_HEALTH_OVERVIEW } from '../widgets/register.js';
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

// =============================================================================
// Adapt the rich domain payload to the Health overview ChatKit widget schema.
// The widget expects a flat list of targets with: id, label, current_value
// (number, not nullable), target, unit, comparison, period, progressPct, accent.
// =============================================================================

const KIND_LABELS: Record<string, string> = {
  protein_g: 'Protein',
  calories_kcal: 'Calories',
  workouts_per_week: 'Workouts / week',
  sleep_hours: 'Sleep',
};

function humaniseKind(kind: string): string {
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  return kind
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function humaniseComparison(c: 'gte' | 'lte' | 'eq'): string {
  return c === 'gte' ? 'at least' : c === 'lte' ? 'at most' : 'exactly';
}

function humanisePeriod(p: string): string {
  return p === 'daily'
    ? 'per day'
    : p === 'weekly'
      ? 'per week'
      : p === 'by_date'
        ? 'by date'
        : 'ongoing';
}

type Accent = 'blue-500' | 'green-500' | 'purple-500' | 'orange-500';

function pickAccent(
  comparison: 'gte' | 'lte' | 'eq',
  current: number,
  target: number,
): Accent {
  if (target <= 0) return 'purple-500';
  const ratio = current / target;
  if (comparison === 'lte') {
    if (ratio > 1) return 'orange-500'; // over the cap
    if (ratio > 0.9) return 'orange-500';
    return 'green-500';
  }
  // gte / eq
  if (ratio >= 1) return 'green-500';
  if (ratio >= 0.6) return 'blue-500';
  return 'purple-500';
}

function progressPct(
  comparison: 'gte' | 'lte' | 'eq',
  current: number,
  target: number,
): number {
  if (target <= 0) return 0;
  const raw = (current / target) * 100;
  if (comparison === 'lte') return Math.min(100, Math.max(0, raw));
  return Math.min(100, Math.max(0, raw));
}

interface WidgetTarget {
  id: string;
  label: string;
  current_value: number;
  target: number;
  unit: string;
  comparison: string;
  period: string;
  progressPct: number;
  accent: Accent;
}

interface WidgetMeal {
  id: string;
  time: string;
  description: string;
  portion_assumed: string;
  calories_kcal: number;
}

interface WidgetWorkout {
  id: string;
  type: string;
}

interface WidgetState {
  user: string;
  today_day_of_week: string;
  today: string;
  current_time_local: string;
  timezone: string;
  active_targets: WidgetTarget[];
  today_meals: WidgetMeal[];
  last_7_days_workouts: WidgetWorkout[];
}

function toWidgetState(
  ctx: UserContext,
  args: {
    today: string;
    activeTargets: TargetWithProgress[];
    todayMeals: Array<{
      eaten_at: string;
      description: string;
      portion_assumed: string | null;
      calories_kcal: number | null;
    }>;
    workouts: Array<{ done_at: string; done_on: string; type: string }>;
  },
): WidgetState {
  let n = 0;
  const nextId = (prefix: string): string => `${prefix}-${++n}`;

  const widgetTargets: WidgetTarget[] = args.activeTargets.map((t) => {
    const current = t.current_value ?? 0;
    return {
      id: nextId('target'),
      label: humaniseKind(t.kind),
      current_value: current,
      target: t.target,
      unit: t.unit,
      comparison: humaniseComparison(t.comparison),
      period: humanisePeriod(t.period),
      progressPct: progressPct(t.comparison, current, t.target),
      accent: pickAccent(t.comparison, current, t.target),
    };
  });

  const widgetMeals: WidgetMeal[] = args.todayMeals.map((m) => ({
    id: nextId('meal'),
    time: istTimeString(new Date(m.eaten_at), ctx.timezone),
    description: m.description,
    // schema requires non-null strings/numbers; fall back to friendly defaults.
    portion_assumed: m.portion_assumed ?? '—',
    calories_kcal: m.calories_kcal ?? 0,
  }));

  const widgetWorkouts: WidgetWorkout[] = args.workouts.map((w) => ({
    id: nextId('workout'),
    type: w.type,
  }));

  return {
    user: ctx.userDisplayName,
    today: args.today,
    today_day_of_week: istDayOfWeek(new Date(), ctx.timezone),
    current_time_local: istTimeString(new Date(), ctx.timezone),
    timezone: ctx.timezone,
    active_targets: widgetTargets,
    today_meals: widgetMeals,
    last_7_days_workouts: widgetWorkouts,
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
      _meta: {
        // Point at the ChatKit widget definition (.widget JSON).
        'openai/outputTemplate': URI_HEALTH_OVERVIEW,
        ui: { resourceUri: URI_HEALTH_OVERVIEW },
      },
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

      // Rich payload for the model — full context including notes, sleep
      // logs, daily totals etc. The model gets this in `content[0].text`
      // so it can reason about everything without needing extra calls.
      const richPayload = {
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
          protein_g: m.protein_g,
          calories_kcal: m.calories_kcal,
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

      // Strictly-shaped widget state matching the Health overview ChatKit
      // widget's jsonSchema. The widget renderer validates this strictly
      // (additionalProperties: false), so we keep it lean.
      const widgetState = toWidgetState(ctx, {
        today,
        activeTargets: active_targets,
        todayMeals,
        workouts,
      });

      return {
        content: [
          { type: 'text', text: JSON.stringify(richPayload, null, 2) },
        ],
        // Cast to loose record because the MCP SDK types structuredContent
        // as { [k: string]: unknown }; our strictly-typed WidgetState
        // satisfies the shape but lacks the explicit index signature.
        structuredContent: widgetState as unknown as Record<string, unknown>,
      };
    },
  );
}
