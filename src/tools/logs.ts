import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { insertLog } from '../db.js';
import { istTimeString } from '../time.js';
import type { UserContext } from './types.js';

const description =
  "Universal logger for anything that isn't a workout or meal — mood, energy, sleep notes, observations, anything the user wants tracked. The `kind` field is free-form (e.g. 'mood', 'energy', 'sleep', 'note', 'symptom'). Use this generously — when in doubt, log it. The user values being able to look back at random notes later.";

export function registerLog(server: McpServer, ctx: UserContext): void {
  server.registerTool(
    'log',
    {
      description,
      annotations: {
        title: 'Log a generic note (mood, sleep, etc.)',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        kind: z
          .string()
          .min(1)
          .describe(
            "Short label, e.g. 'mood', 'energy', 'sleep', 'note', 'symptom'.",
          ),
        value: z.string().min(1).describe('The actual content of the log.'),
        recorded_at: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe('ISO-8601 UTC timestamp. Defaults to now.'),
      },
    },
    async (args) => {
      const row = await insertLog(ctx.db, ctx.userId, {
        kind: args.kind,
        value: args.value,
        recorded_at: args.recorded_at,
        timezone: ctx.timezone,
      });

      const time = istTimeString(new Date(row.recorded_at), ctx.timezone);
      const summary = `Logged ${row.kind}=${row.value} at ${time}`;

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
