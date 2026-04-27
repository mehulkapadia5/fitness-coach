import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  activeTargets,
  countWorkoutsBetween,
  insertWorkout,
} from '../db.js';
import {
  daysAgoIST,
  istDateString,
  istDayOfWeek,
  istTimeString,
} from '../time.js';
import { URI_LOG_WORKOUT } from '../widgets/templates.js';
import type { UserContext } from './types.js';

const description =
  'Log a completed workout. Call this immediately whenever the user mentions doing, finishing, or completing exercise — even casually ("just did legs", "went for a run", "did push + light legs"). DO NOT ask for confirmation before logging. After logging, confirm in ONE short line. If the user mentions multiple components ("push + light legs"), log as a single workout with type=\'mixed\' and capture the detail in notes. Default `done_on` to today (in the user\'s local timezone) unless the user specifies otherwise.';

const TYPE_VALUES = [
  'push',
  'pull',
  'legs',
  'run',
  'walk',
  'rest',
  'mixed',
  'other',
] as const;

const INTENSITY_VALUES = ['light', 'moderate', 'heavy'] as const;

export function registerLogWorkout(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    'log_workout',
    {
      description,
      annotations: {
        title: 'Log a workout',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        'openai/outputTemplate': URI_LOG_WORKOUT,
        ui: { resourceUri: URI_LOG_WORKOUT },
      },
      inputSchema: {
        type: z
          .enum(TYPE_VALUES)
          .describe(
            'Workout type. Use "mixed" for combined sessions like "push + light legs".',
          ),
        intensity: z
          .enum(INTENSITY_VALUES)
          .optional()
          .describe('Optional intensity for the heavier component.'),
        duration_min: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional duration in minutes.'),
        notes: z
          .string()
          .optional()
          .describe(
            'Free-form detail — e.g. "+ light legs for test boost", "5k easy", "comeback session".',
          ),
        done_on: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "YYYY-MM-DD in user's local timezone. Defaults to today. Only set when the user explicitly logs a past workout.",
          ),
      },
    },
    async (args) => {
      const row = await insertWorkout(ctx.db, ctx.userId, {
        type: args.type,
        intensity: args.intensity,
        duration_min: args.duration_min,
        notes: args.notes,
        done_on: args.done_on,
        timezone: ctx.timezone,
      });

      const day = istDayOfWeek(new Date(row.done_at), ctx.timezone);
      const time = istTimeString(new Date(row.done_at), ctx.timezone);
      const intensityPart = row.intensity ? ` (${row.intensity})` : '';
      const summary = `Logged: ${day} ${row.type}${intensityPart} at ${time}`;

      // Enrich for the widget: rolling 7-day count + weekly target if set
      // so the widget can show "3/5 this week" with a progress bar.
      const today = istDateString(new Date(row.done_at), ctx.timezone);
      const [weeklyCount, allTargets] = await Promise.all([
        countWorkoutsBetween(
          ctx.db,
          ctx.userId,
          daysAgoIST(6, ctx.timezone),
          today,
        ),
        activeTargets(ctx.db, ctx.userId),
      ]);
      const weekTarget = allTargets.find(
        (t) => t.kind === 'workouts_per_week' && t.period === 'weekly',
      );

      const structuredContent = {
        type: row.type,
        intensity: row.intensity,
        duration_min: row.duration_min,
        notes: row.notes,
        day_of_week: day,
        time,
        weekly_count: weeklyCount,
        weekly_target: weekTarget?.target_value ?? null,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { logged: true, id: row.id, summary },
              null,
              2,
            ),
          },
        ],
        structuredContent,
      };
    },
  );
}
