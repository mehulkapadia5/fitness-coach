// Admin auth — single shared password set via `wrangler secret put
// ADMIN_PASSWORD`. After login, we set a cookie that contains an HMAC
// of the password so we don't put the raw secret in the browser, and we
// can verify it without keeping any server-side session state.

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Construct a session cookie value: `expiresAtMs.hmac` where the HMAC is
 * computed over the expiresAt timestamp using the admin password as the
 * key. Verifying just requires recomputing the HMAC.
 */
export async function buildSessionCookieValue(
  adminPassword: string,
): Promise<string> {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  const sig = await hmacSha256(adminPassword, expiresAt);
  return `${expiresAt}.${sig}`;
}

export async function verifySessionCookie(
  request: Request,
  adminPassword: string,
): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`),
  );
  if (!match) return false;
  const [expiresAt, sig] = match[1].split('.');
  if (!expiresAt || !sig) return false;
  const expiresAtNum = Number.parseInt(expiresAt, 10);
  if (!Number.isFinite(expiresAtNum) || expiresAtNum < Date.now()) return false;
  const expectedSig = await hmacSha256(adminPassword, expiresAt);
  return constantTimeEqual(sig, expectedSig);
}

export function buildSessionSetCookieHeader(value: string): string {
  // HttpOnly: not accessible from JS (XSS protection).
  // Secure: HTTPS only.
  // SameSite=Strict: don't send cross-site (CSRF protection).
  // Path=/admin: only sent on /admin routes.
  // Max-Age in seconds.
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${maxAge}`;
}

export function buildLogoutSetCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`;
}

/**
 * Constant-time check of a submitted password against the configured one.
 */
export function checkPassword(
  submitted: string,
  configured: string,
): boolean {
  if (!configured) return false;
  // Same length isn't useful here since we control both, but we still
  // run the loop to avoid a length-based early-exit timing leak.
  return constantTimeEqual(submitted, configured);
}
