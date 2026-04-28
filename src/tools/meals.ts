import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { insertMeal } from '../db.js';
import { istTimeString } from '../time.js';
import type { UserContext } from './types.js';

const description =
  "Log a meal. Capture the user's description verbatim. " +
  "ALL of `portion_assumed`, `calories_kcal`, `protein_g`, `carbs_g`, `fat_g` are REQUIRED — the tool refuses calls without them. " +
  "DO NOT silently invent values. " +
  "BEFORE calling, you MUST do this two-step flow:\n\n" +
  "STEP 1 — propose. Show the user a one-line summary of what you're about to log: \n" +
  "  e.g. 'Logging chicken biryani (full plate, ~500g) — about 750 kcal, 35g P / 90g C / 28g F. Sound right?'\n" +
  "Include: assumed portion, all 4 macros (cal/P/C/F).\n\n" +
  "STEP 2 — log. Only after the user reacts positively (yes/sounds right/looks fine/silence-after-question), call this tool with the values.\n" +
  "If the user pushes back, adjust and re-propose; don't log until they confirm.\n\n" +
  "EXCEPTIONS to the propose-first rule:\n" +
  "  - 'I just had X' where X is fully specific quantity ('100g chicken breast', '2 large eggs', '200ml milk') and macros are well-known → log directly with one-line confirmation including all macros.\n" +
  "  - 'skipped lunch' / 'skipped' → log immediately with description='skipped', portion_assumed='n/a (skipped)', all macros = 0.\n\n" +
  "HIGH-VARIANCE items where size dramatically changes macros (alcohol bottle/can size, pizza slices/size, rice/pasta/curry portions, restaurant dishes, paratha count, fried snacks, sweets, smoothie ml) → ALWAYS ask the user one short clarifying question about size first ('Budweiser Magnum: 330ml, 500ml, or 650ml?'), THEN propose, THEN log.\n\n" +
  "Always set `portion_assumed` to a plain-English description of the exact portion you costed the macros against (e.g. 'Budweiser Magnum 500ml bottle', 'half kachori, deep-fried, ~60g'). " +
  "After logging, repeat the assumed portion + all 4 macros in your reply so the user can catch wrong assumptions. " +
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
        calories_kcal: z
          .number()
          .int()
          .nonnegative()
          .describe(
            'REQUIRED. Calories in kcal for the portion described in portion_assumed. Use 0 for water and other zero-calorie items.',
          ),
        protein_g: z
          .number()
          .int()
          .nonnegative()
          .describe(
            'REQUIRED. Protein in grams for the portion. Use 0 for items with negligible protein (e.g. soft drinks, beer).',
          ),
        carbs_g: z
          .number()
          .int()
          .nonnegative()
          .describe(
            'REQUIRED. Carbohydrates in grams for the portion (total carbs, including sugars). Use 0 for items with no carbs.',
          ),
        fat_g: z
          .number()
          .int()
          .nonnegative()
          .describe(
            'REQUIRED. Fat in grams for the portion (total fat). Use 0 for items with no fat.',
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
        carbs_g: args.carbs_g,
        fat_g: args.fat_g,
        notes: args.notes,
        eaten_at: args.eaten_at,
        timezone: ctx.timezone,
      });

      const time = istTimeString(new Date(row.eaten_at), ctx.timezone);
      const macros =
        `${row.calories_kcal} kcal, ` +
        `${row.protein_g}g P / ${row.carbs_g}g C / ${row.fat_g}g F`;
      const summary =
        `Logged: ${row.description} — assumed ${row.portion_assumed} (${macros}) at ${time}. ` +
        `Repeat the assumed portion and all 4 macros to the user so they can correct any wrong assumption.`;

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
