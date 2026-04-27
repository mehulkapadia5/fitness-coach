// Default handler — receives any request that isn't matched by `apiRoute`
// in the OAuthProvider config. We use it for:
//   1. /authorize  — start of OAuth dance: parse Claude.ai's auth request,
//                    save it in KV under a state token, redirect to Google.
//   2. /oauth/google/callback — Google sends user back here with a code.
//                    We exchange the code, look up the user, upsert into
//                    D1, then call completeAuthorization to redirect
//                    Claude.ai back with its own code.
//   3. /icon.svg, /favicon.ico, /healthz, / — public static / status routes.

import { handleAdminRoute } from '../admin/handler.js';
import { upsertUserByGoogle } from '../db.js';
import { iconResponse } from '../icon.js';
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  newState,
} from './google.js';
import type {
  AuthRequest,
  OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ADMIN_PASSWORD: string;
}

interface PendingAuth {
  oauthReqInfo: AuthRequest;
  // expiresAt is enforced by KV TTL but we keep a copy for logging/debugging.
  createdAt: number;
}

const PENDING_TTL_SECONDS = 600; // 10 min for the user to finish Google sign-in

const defaultHandler: ExportedHandler<Env> = {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // Public, no-auth routes
    if (url.pathname === '/' || url.pathname === '/healthz') {
      return new Response('fitness-coach ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }
    if (url.pathname === '/icon.svg' || url.pathname === '/favicon.ico') {
      return iconResponse();
    }

    // Admin dashboard. Mounted under /admin/*. Has its own cookie auth.
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handleAdminRoute(request, env, url);
    }

    // OAuth: kick off Google sign-in
    if (url.pathname === '/authorize') {
      try {
        const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(
          request,
        );
        const state = newState();
        const pending: PendingAuth = {
          oauthReqInfo,
          createdAt: Date.now(),
        };
        await env.OAUTH_KV.put(`pending:${state}`, JSON.stringify(pending), {
          expirationTtl: PENDING_TTL_SECONDS,
        });
        const redirectUri = `${url.origin}/oauth/google/callback`;
        const googleUrl = buildGoogleAuthUrl({
          clientId: env.GOOGLE_CLIENT_ID,
          redirectUri,
          state,
        });
        return Response.redirect(googleUrl, 302);
      } catch (err) {
        console.error('authorize error', err);
        return new Response(
          `Authorization request invalid: ${err instanceof Error ? err.message : String(err)}`,
          { status: 400 },
        );
      }
    }

    // OAuth: handle Google's callback
    if (url.pathname === '/oauth/google/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const oauthError = url.searchParams.get('error');

      if (oauthError) {
        return new Response(
          `Sign-in cancelled or rejected by Google: ${oauthError}`,
          { status: 400 },
        );
      }
      if (!code || !state) {
        return new Response('Missing code or state from Google.', {
          status: 400,
        });
      }

      const pendingRaw = await env.OAUTH_KV.get(`pending:${state}`);
      if (!pendingRaw) {
        return new Response(
          'State expired or unknown. Restart the connector.',
          { status: 400 },
        );
      }
      const pending: PendingAuth = JSON.parse(pendingRaw);
      // One-shot use of state to prevent replay.
      await env.OAUTH_KV.delete(`pending:${state}`);

      const redirectUri = `${url.origin}/oauth/google/callback`;
      let userInfo;
      try {
        const tokens = await exchangeCodeForTokens({
          code,
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri,
        });
        userInfo = await fetchGoogleUserInfo(tokens.access_token);
      } catch (err) {
        console.error('google exchange error', err);
        return new Response(
          `Google sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
          { status: 502 },
        );
      }

      if (!userInfo.email_verified) {
        return new Response(
          'Your Google email is not verified. Verify it with Google and try again.',
          { status: 403 },
        );
      }

      // Upsert into our users table. First-time sign-in creates the row.
      const user = await upsertUserByGoogle(env.DB, {
        google_sub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture_url: userInfo.picture,
      });

      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: pending.oauthReqInfo,
        userId: user.id,
        metadata: { email: user.email },
        scope: pending.oauthReqInfo.scope,
        // `props` is what gets surfaced to apiHandler via this.ctx.props
        // on every authenticated MCP request. Keep it small — it's stored
        // with every issued token.
        props: {
          userId: user.id,
          email: user.email,
          name: user.name ?? user.email,
          timezone: user.timezone,
        },
      });

      return Response.redirect(redirectTo, 302);
    }

    return new Response('Not found', { status: 404 });
  },
};

export default defaultHandler;
