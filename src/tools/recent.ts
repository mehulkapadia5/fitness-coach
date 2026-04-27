import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  logsSince,
  mealsSince,
  targetsSince,
  workoutsSince,
} from '../db.js';
import type { UserContext } from './types.js';

const description =
  'Fetch recent rows from a table. Use when the user asks about a longer period than `get_context` covers (e.g. "show me my workouts this month", "what have I been eating recently", "show me targets I\'ve set"). Max 90 days.';

export function registerRecent(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    'recent',
    {
      description,
      annotations: {
        title: 'Fetch recent rows from workouts, meals, logs, or targets',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: {
        table: z
          .enum(['workouts', 'meals', 'logs', 'targets'])
          .describe('Which table to read from.'),
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .describe('How many days back to fetch (1-90).'),
      },
    },
    async (args) => {
      let rows: unknown[];
      switch (args.table) {
        case 'workouts':
          rows = await workoutsSince(
            ctx.db,
            ctx.userId,
            args.days,
            ctx.timezone,
          );
          break;
        case 'meals':
          rows = await mealsSince(
            ctx.db,
            ctx.userId,
            args.days,
            ctx.timezone,
          );
          break;
        case 'logs':
          rows = await logsSince(ctx.db, ctx.userId, args.days, ctx.timezone);
          break;
        case 'targets':
          rows = await targetsSince(
            ctx.db,
            ctx.userId,
            args.days,
            ctx.timezone,
          );
          break;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
      };
    },
  );
}
