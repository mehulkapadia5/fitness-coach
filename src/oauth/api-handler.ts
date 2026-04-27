// API handler — invoked by the OAuth provider for any request that matches
// `apiRoute` AND carries a valid Bearer access token. The user props
// passed to completeAuthorization() are surfaced via this.ctx.props.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { buildServer } from '../mcp.js';
import type { Env } from './handler.js';

interface UserProps {
  userId: string;
  email: string;
  name: string;
  timezone: string;
}

export class McpApiHandler extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const props = this.ctx.props as UserProps | undefined;
    if (!props) {
      // Should never happen — OAuthProvider only invokes us with a valid
      // token + props attached. Surface a clear error instead of crashing.
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32_001, message: 'Unauthorized' },
          id: null,
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    const url = new URL(request.url);
    const ctx = {
      db: this.env.DB,
      userId: props.userId,
      timezone: props.timezone,
      userDisplayName: props.name,
    };

    const server = buildServer(ctx, url.origin);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } catch (err) {
      console.error('MCP request error:', err);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32_603, message: 'Internal server error' },
          id: null,
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
  }
}
