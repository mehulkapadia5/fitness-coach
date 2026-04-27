// Minimal Google OAuth 2.0 client. We use the Authorization Code flow (no
// PKCE on the upstream — Google still supports plain code flow for confidential
// clients, and our Worker holds a client secret). Scopes: openid, email,
// profile. We only need the user's stable `sub` (Google user ID), email,
// name, and picture URL.

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleUserInfo {
  sub: string; // stable Google user identifier
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

export function buildGoogleAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: args.state,
    access_type: 'online', // we don't need a Google refresh token
    prompt: 'select_account', // let user pick which Google account
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ access_token: string; id_token?: string; expires_in: number }> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google userinfo failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Generate a cryptographically random state string for CSRF protection on
 * the OAuth round-trip. The same value gets stored alongside the pending
 * auth request in KV and verified on callback.
 */
export function newState(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
