import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import { registerGetContext } from './tools/context.js';
import { registerLogMeal } from './tools/meals.js';
import { registerLog } from './tools/logs.js';
import { registerLogWorkout } from './tools/workouts.js';
import { registerRecent } from './tools/recent.js';
import { registerClearTarget, registerSetTarget } from './tools/targets.js';
import type { UserContext } from './tools/types.js';

/**
 * Construct an MCP server bound to a single user's context. Built fresh
 * per request — the OAuth provider's apiHandler is invoked with the
 * authenticated user's props on every call, and we wire those through to
 * each tool registration so every DB query naturally scopes to the user.
 */
export function buildServer(
  ctx: UserContext,
  publicOrigin: string,
): McpServer {
  const server = new McpServer(
    {
      name: 'fitness-coach',
      version: '2.0.0',
      title: 'Fitness Coach',
      icons: [
        {
          src: `${publicOrigin}/icon.svg`,
          mimeType: 'image/svg+xml',
          sizes: ['any'],
        },
      ],
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { tools: {} },
      // ajv pulls in things that don't run cleanly on the Workers runtime;
      // the cfworker validator is the supported edge alternative.
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    },
  );

  registerGetContext(server, ctx);
  registerLogWorkout(server, ctx);
  registerLogMeal(server, ctx);
  registerLog(server, ctx);
  registerSetTarget(server, ctx);
  registerClearTarget(server, ctx);
  registerRecent(server, ctx);

  return server;
}
