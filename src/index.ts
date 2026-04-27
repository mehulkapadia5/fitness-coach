import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { McpApiHandler } from './oauth/api-handler.js';
import defaultHandler from './oauth/handler.js';

// fitness-coach v2 — OAuth-protected MCP server.
//
// Architecture:
//   - The Cloudflare OAuth provider library handles the OAuth machinery:
//     `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`,
//     `/token`, dynamic client registration at `/register`.
//   - Our `defaultHandler` (src/oauth/handler.ts) handles `/authorize` and
//     `/oauth/google/callback` — the upstream-IdP delegation to Google.
//   - Our `apiHandler` (src/oauth/api-handler.ts, McpApiHandler class) is
//     the actual MCP server. It only runs after the provider validates
//     the Bearer token and resolves the user's props.

export { McpApiHandler };

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: McpApiHandler,
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: ['health.read', 'health.write'],
  // Access tokens valid for 1 hour by default.
  accessTokenTTL: 3600,
});
