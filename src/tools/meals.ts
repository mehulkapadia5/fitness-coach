import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { insertMeal } from '../db.js';
import { istTimeString } from '../time.js';
import type { UserContext } from './types.js';

const description =
  'Log a meal. Call this when the user mentions eating ("had eggs and toast", "lunch was chicken tikka bowl", "skipped dinner"). DO NOT ask for confirmation. Capture the user\'s description verbatim. Fill `protein_g` and `calories_kcal` if the user states them OR you can confidently estimate from specific items (e.g. "100g chicken breast" — yes; "had lunch" — no). If user says they skipped, log it with description=\'skipped\' and a notes field. Default `eaten_at` to now. The values you log here roll into daily target progress shown in `get_context`, so estimating is useful when targets are active.';

export function registerLogMeal(server: McpServer, ctx: UserContext): void {
  server.registerTool(
    'log_meal',
    {
      description,
      annotations: {
        title: 'Log a meal',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        description: z
          .string()
          .min(1)
          .describe(
            "What was eaten, verbatim. For skipped meals, use 'skipped'.",
          ),
        protein_g: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Protein in grams. Only fill if the user states it or it can be confidently estimated.',
          ),
        calories_kcal: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Calories in kcal. Only fill if the user states it or it can be confidently estimated from specific items.',
          ),
        notes: z
          .string()
          .optional()
          .describe(
            'Optional context — e.g. "cheat meal", "post-workout", "skipped because busy".',
          ),
        eaten_at: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'ISO-8601 UTC timestamp. Defaults to now. Only set for past meals.',
          ),
      },
    },
    async (args) => {
      const row = await insertMeal(ctx.db, ctx.userId, {
        description: args.description,
        protein_g: args.protein_g,
        calories_kcal: args.calories_kcal,
        notes: args.notes,
        eaten_at: args.eaten_at,
        timezone: ctx.timezone,
      });

      const time = istTimeString(new Date(row.eaten_at), ctx.timezone);
      const macroParts: string[] = [];
      if (row.protein_g != null) macroParts.push(`${row.protein_g}g protein`);
      if (row.calories_kcal != null)
        macroParts.push(`${row.calories_kcal}kcal`);
      const macroSuffix =
        macroParts.length > 0 ? ` (${macroParts.join(', ')})` : '';
      const summary = `Logged: ${row.description}${macroSuffix} at ${time}`;

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
      };
    },
  );
}
