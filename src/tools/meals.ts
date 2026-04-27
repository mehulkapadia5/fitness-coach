import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { activeTargets, insertMeal, sumMealField } from '../db.js';
import { istDateString, istTimeString } from '../time.js';
import { URI_LOG_MEAL } from '../widgets/templates.js';
import type { UserContext } from './types.js';

const description =
  "Log a meal. Capture the user's description verbatim. " +
  "ALL THREE of `portion_assumed`, `calories_kcal`, `protein_g` are REQUIRED — the tool refuses calls without them. " +
  "DO NOT silently invent values. Three buckets:\n" +
  "(a) Specific quantities ('100g chicken breast', '2 large eggs', '200ml milk') → portion_assumed echoes the user's exact words; estimate accurately and log immediately.\n" +
  "(b) HIGH-VARIANCE items where size dramatically changes calories (alcohol bottle/can size, pizza slices/size, rice/pasta/curry portions, restaurant dishes, paratha count, fried snacks, sweets, smoothie ml) → DO NOT CALL THIS TOOL YET. Ask the user one short clarifying question first ('Budweiser Magnum: 330ml, 500ml, or 650ml?'). After they answer, set `portion_assumed` to the answered size and log.\n" +
  "(c) Low-variance ambiguous items ('an apple', 'a banana', 'cup of black coffee') → propose an estimate in one short line; log when they react.\n" +
  "If user says they skipped: description='skipped', portion_assumed='n/a (skipped)', protein_g=0, calories_kcal=0, log immediately. " +
  "The summary returned by the tool includes `portion_assumed` — repeat that to the user in your reply so they can catch wrong assumptions. " +
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
      _meta: {
        'openai/outputTemplate': URI_LOG_MEAL,
        ui: { resourceUri: URI_LOG_MEAL },
      },
      inputSchema: {
        description: z
          .string()
          .min(1)
          .describe(
            "What was eaten, verbatim from the user. For skipped meals, use 'skipped'.",
          ),
        portion_assumed: z
          .string()
          .min(1)
          .describe(
            "REQUIRED. The exact portion you're committing to, in plain English so the user can verify. " +
              "Examples: 'Budweiser Magnum 500ml bottle', 'half kachori, deep-fried, ~60g', " +
              "'2 large eggs scrambled with butter', 'full plate chicken biryani, restaurant size'. " +
              "If the user gave a specific quantity, echo it. If you assumed a size, write the assumed size " +
              "(but you should have asked first for high-variance items per the description).",
          ),
        protein_g: z
          .number()
          .int()
          .nonnegative()
          .describe(
            'REQUIRED. Protein in grams for the portion described in portion_assumed. Use 0 for items with negligible protein (e.g. soft drinks, beer).',
          ),
        calories_kcal: z
          .number()
          .int()
          .nonnegative()
          .describe(
            'REQUIRED. Calories in kcal for the portion described in portion_assumed. Use 0 for water and other zero-calorie items.',
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
        portion_assumed: args.portion_assumed,
        protein_g: args.protein_g,
        calories_kcal: args.calories_kcal,
        notes: args.notes,
        eaten_at: args.eaten_at,
        timezone: ctx.timezone,
      });

      const time = istTimeString(new Date(row.eaten_at), ctx.timezone);
      const summary =
        `Logged: ${row.description} — assumed ${row.portion_assumed} (${row.calories_kcal} kcal, ${row.protein_g}g protein) at ${time}. ` +
        `Tell the user the assumed portion so they can correct if wrong.`;

      // Enrich with daily totals so the widget can render a calorie
      // progress bar against the user's active calorie target.
      const today = istDateString(new Date(row.eaten_at), ctx.timezone);
      const [dailyKcal, dailyProtein, allTargets] = await Promise.all([
        sumMealField(ctx.db, ctx.userId, 'calories_kcal', today),
        sumMealField(ctx.db, ctx.userId, 'protein_g', today),
        activeTargets(ctx.db, ctx.userId),
      ]);
      const calTarget = allTargets.find(
        (t) => t.kind === 'calories_kcal' && t.period === 'daily',
      );
      const proteinTarget = allTargets.find(
        (t) => t.kind === 'protein_g' && t.period === 'daily',
      );

      const structuredContent = {
        description: row.description,
        portion_assumed: row.portion_assumed,
        calories_kcal: row.calories_kcal,
        protein_g: row.protein_g,
        time,
        daily_total_calories: dailyKcal,
        daily_total_protein_g: dailyProtein,
        daily_target_calories: calTarget?.target_value ?? null,
        daily_target_protein_g: proteinTarget?.target_value ?? null,
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
