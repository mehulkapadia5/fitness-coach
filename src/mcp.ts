import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import { registerGetContext } from './tools/context.js';
import { registerLogMeal } from './tools/meals.js';
import { registerLog } from './tools/logs.js';
import { registerLogWorkout } from './tools/workouts.js';
import { registerRecent } from './tools/recent.js';
import { registerClearTarget, registerSetTarget } from './tools/targets.js';

export function buildServer(db: D1Database, publicOrigin: string): McpServer {
  const server = new McpServer(
    {
      name: 'claude-coach',
      version: '1.0.0',
      title: 'Claude Coach',
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

  const getDB = (): D1Database => db;

  registerGetContext(server, getDB);
  registerLogWorkout(server, getDB);
  registerLogMeal(server, getDB);
  registerLog(server, getDB);
  registerSetTarget(server, getDB);
  registerClearTarget(server, getDB);
  registerRecent(server, getDB);

  return server;
}
