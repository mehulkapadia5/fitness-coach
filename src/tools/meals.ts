import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { insertMeal } from '../db.js';
import { istTimeString } from '../time.js';
import type { UserContext } from './types.js';

const description =
  "Log a meal. Capture the user's description verbatim. ALWAYS fill `protein_g` and `calories_kcal` — never call this tool without them. " +
  "BEFORE calling, decide which bucket the meal falls into: " +
  "(a) Specific quantities like '100g chicken breast', '2 eggs', '200ml milk' → estimate accurately and call immediately. " +
  "(b) HIGH-VARIANCE items where size dramatically changes calories (alcohol bottle/can size, pizza slices/size, rice/pasta/curry portions, restaurant dishes, paratha count, fried snacks, sweets, smoothie ml) → DO NOT call this tool yet. Ask the user one short clarifying question about size first ('Budweiser Magnum: 330ml, 500ml, or 650ml?'), then estimate, then call. NEVER silently assume a default size. " +
  "(c) Low-variance items like 'an apple', 'cup of black coffee', 'a banana' → propose an estimate in one line, log when they react. " +
  "If user says they skipped: description='skipped', protein_g=0, calories_kcal=0, log immediately. " +
  "When logging with an estimate, mention the assumption in the confirmation: 'Logged: Budweiser Magnum 500ml (~210 kcal). Tell me if it was different.' " +
  "Default `eaten_at` to now.";

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
