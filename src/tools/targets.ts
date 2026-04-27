import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { clearTarget, setTarget } from '../db.js';
import { URI_SET_TARGET } from '../widgets/templates.js';
import type { UserContext } from './types.js';

const setDescription =
  'Set or update a personal health target. Call this when the user expresses a goal ("want to hit 150g protein a day", "stay under 2500 cals", "want to train 5x/week", "sleep 8 hours nightly"). DO NOT ask for confirmation. The four well-known kinds with auto-progress in `get_context` are: `protein_g` (daily, gte), `calories_kcal` (daily, lte), `workouts_per_week` (weekly, gte), `sleep_hours` (daily, gte). You can also use any other `kind` for non-standard targets — those will be stored but won\'t get auto-computed progress. Setting a new target with the same `kind` deactivates the previous one (history is preserved).';

const clearDescription =
  'Clear (deactivate) the active target for a given kind. Call this when the user says they\'re dropping a goal ("scrap the protein target", "no more calorie tracking"). The historical row stays in the DB; it just stops being "active". DO NOT ask for confirmation.';

const KIND_HINT_VALUES = [
  'protein_g',
  'calories_kcal',
  'workouts_per_week',
  'sleep_hours',
] as const;

export function registerSetTarget(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    'set_target',
    {
      description: setDescription,
      annotations: {
        title: 'Set or update a health target',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        'openai/outputTemplate': URI_SET_TARGET,
        ui: { resourceUri: URI_SET_TARGET },
      },
      inputSchema: {
        kind: z
          .string()
          .min(1)
          .describe(
            `Target identifier. Use one of the well-known kinds when applicable so progress shows up in get_context: ${KIND_HINT_VALUES.join(
              ', ',
            )}. Otherwise pick a short snake_case label (e.g. 'water_l', 'steps').`,
          ),
        target_value: z
          .number()
          .describe(
            'The numeric target. e.g. 150 for protein_g, 2500 for calories_kcal, 5 for workouts_per_week.',
          ),
        unit: z
          .string()
          .min(1)
          .describe(
            "Unit string. Use 'g', 'kcal', 'count', 'hours', 'kg', 'l', etc.",
          ),
        period: z
          .enum(['daily', 'weekly', 'by_date', 'ongoing'])
          .describe(
            "How the target is measured. 'daily' rolls up each day; 'weekly' over last 7 days; 'by_date' for one-shot deadlines (e.g. weight by Aug); 'ongoing' for habits with no period.",
          ),
        comparison: z
          .enum(['gte', 'lte', 'eq'])
          .describe(
            "Comparison operator. 'gte' = at least (protein, workouts); 'lte' = at most (calories, alcohol); 'eq' = exactly.",
          ),
        notes: z
          .string()
          .optional()
          .describe(
            'Optional context — why the target, when it was set, etc.',
          ),
      },
    },
    async (args) => {
      const row = await setTarget(ctx.db, ctx.userId, {
        ...args,
        timezone: ctx.timezone,
      });
      const op =
        args.comparison === 'gte'
          ? '≥'
          : args.comparison === 'lte'
            ? '≤'
            : '=';
      const summary = `Target set: ${row.kind} ${op} ${row.target_value}${row.unit} (${row.period})`;
      const structuredContent = {
        kind: row.kind,
        target_value: row.target_value,
        unit: row.unit,
        period: row.period,
        comparison: row.comparison,
        set_on: row.set_on,
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

export function registerClearTarget(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    'clear_target',
    {
      description: clearDescription,
      annotations: {
        title: 'Clear an active health target',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        kind: z
          .string()
          .min(1)
          .describe('The target kind to deactivate.'),
      },
    },
    async ({ kind }) => {
      const cleared = await clearTarget(ctx.db, ctx.userId, kind);
      const summary =
        cleared > 0
          ? `Cleared target: ${kind}`
          : `No active target found for ${kind}`;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ cleared, summary }, null, 2),
          },
        ],
      };
    },
  );
}
