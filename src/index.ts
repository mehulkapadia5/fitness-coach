import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { iconResponse } from './icon.js';
import { buildServer } from './mcp.js';

export interface Env {
  DB: D1Database;
  MCP_TOKEN: string;
}

const MCP_PREFIX = '/mcp/';

function timingSafeEqual(a: string, b: string): boolean {
  // Compare in constant time relative to the longer input. We mix lengths
  // into the diff so unequal-length strings still compare in O(max(len)).
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    const ax = aBytes[i] ?? 0;
    const bx = bBytes[i] ?? 0;
    diff |= ax ^ bx;
  }
  return diff === 0;
}

function jsonRpcError(
  status: number,
  code: number,
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Tiny health check, no auth — useful when sanity-checking deploys.
    if (url.pathname === '/' || url.pathname === '/healthz') {
      return new Response('health-mcp ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    // Connector icon. Served unauthenticated so Claude.ai can fetch it
    // from the URL referenced in serverInfo.icons.
    if (url.pathname === '/icon.svg' || url.pathname === '/favicon.ico') {
      return iconResponse();
    }

    if (!url.pathname.startsWith(MCP_PREFIX)) {
      return new Response('Not found', { status: 404 });
    }

    const token = url.pathname.slice(MCP_PREFIX.length).split('/')[0] ?? '';
    const expected = env.MCP_TOKEN ?? '';
    if (!token || !expected || !timingSafeEqual(token, expected)) {
      return jsonRpcError(401, -32_001, 'Unauthorized');
    }

    const server = buildServer(env.DB, url.origin);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      // Claude.ai's MCP connector sends `Accept: application/json` only —
      // SSE-preferred mode rejects that with "Not Acceptable". This server
      // has no streaming notifications anyway, so JSON-only is the right
      // shape: one POST, one JSON response, no SSE wrapping.
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      // The Response returned here owns a ReadableStream that the protocol
      // is still writing to. Closing the transport/server here would cut
      // the stream short, so we let the isolate GC them after the response
      // has been fully sent.
      return await transport.handleRequest(request);
    } catch (err) {
      console.error('MCP request error:', err);
      return jsonRpcError(500, -32_603, 'Internal server error');
    }
  },
} satisfies ExportedHandler<Env>;
