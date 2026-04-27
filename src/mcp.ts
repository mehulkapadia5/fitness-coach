import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { logToolCall } from './db.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import { registerGetContext } from './tools/context.js';
import { registerLogMeal } from './tools/meals.js';
import { registerLog } from './tools/logs.js';
import { registerLogWorkout } from './tools/workouts.js';
import { registerRecent } from './tools/recent.js';
import { registerClearTarget, registerSetTarget } from './tools/targets.js';
import type { UserContext } from './tools/types.js';

interface CallToolResultLike {
  content?: Array<{ type?: string; text?: string }>;
}

function extractResultText(result: unknown): string | null {
  // We log the first text content block from the tool result. That's
  // typically the JSON-as-text our tools return. If the tool returned
  // nothing or returned a non-text content block, we leave it null.
  const r = result as CallToolResultLike | null | undefined;
  if (!r || !Array.isArray(r.content)) return null;
  const firstText = r.content.find((c) => c?.type === 'text');
  return firstText?.text ?? null;
}

/**
 * Wraps `server.registerTool` so every subsequent registration is
 * transparently audit-logged. Each invocation:
 *   - times the handler
 *   - persists to `tool_calls` with userId, args, result, error, duration
 *   - rethrows the original error so the protocol still surfaces failures
 *
 * Tool files don't need to know about this — they keep calling
 * `server.registerTool(...)` exactly as before.
 */
function installLoggingWrapper(server: McpServer, ctx: UserContext): void {
  type RegisterTool = typeof server.registerTool;
  const original: RegisterTool = server.registerTool.bind(server);

  // The registerTool overload is varied; we go through the most common
  // shape (name, config, callback) and keep the rest pass-through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (
    name: string,
    config: unknown,
    handler: (args: unknown) => Promise<unknown> | unknown,
  ) => {
    const wrapped = async (args: unknown) => {
      const startMs = Date.now();
      let result: unknown;
      let errorMsg: string | null = null;
      try {
        result = await handler(args);
        return result;
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        const durationMs = Date.now() - startMs;
        // Fire-and-forget. We don't await this so the tool response isn't
        // delayed by the audit insert. Errors here only show up in
        // wrangler tail — they shouldn't break the user experience.
        logToolCall(ctx.db, {
          userId: ctx.userId,
          toolName: name,
          args,
          resultText: extractResultText(result),
          durationMs,
          error: errorMsg,
        }).catch((err) => console.error('logToolCall failed:', err));
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(name, config, wrapped);
  };
}

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

  installLoggingWrapper(server, ctx);

  registerGetContext(server, ctx);
  registerLogWorkout(server, ctx);
  registerLogMeal(server, ctx);
  registerLog(server, ctx);
  registerSetTarget(server, ctx);
  registerClearTarget(server, ctx);
  registerRecent(server, ctx);

  return server;
}
