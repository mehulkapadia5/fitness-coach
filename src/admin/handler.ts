// Admin route dispatcher. Mounted under /admin/* by the OAuth defaultHandler.

import {
  buildLogoutSetCookieHeader,
  buildSessionCookieValue,
  buildSessionSetCookieHeader,
  checkPassword,
  verifySessionCookie,
} from './auth.js';
import {
  getUserData,
  getUserDetail,
  listUsers,
  recentActivity,
  recentToolCallsAll,
  recentToolCallsForUser,
  totalCounts,
} from './queries.js';
import {
  renderActivity,
  renderCallsFeed,
  renderLogin,
  renderUserDetail,
  renderUsersList,
} from './views.js';

interface AdminEnv {
  DB: D1Database;
  ADMIN_PASSWORD: string;
}

const HTML_HEADERS: HeadersInit = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store',
  // Don't render this in iframes anywhere.
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

function htmlResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: { ...HTML_HEADERS, ...(init?.headers ?? {}) },
  });
}

export async function handleAdminRoute(
  request: Request,
  env: AdminEnv,
  url: URL,
): Promise<Response> {
  const path = url.pathname;

  // Public: login form (GET) and submission (POST).
  if (path === '/admin/login') {
    if (request.method === 'GET') {
      return htmlResponse(renderLogin());
    }
    if (request.method === 'POST') {
      const form = await request.formData();
      const submitted = String(form.get('password') ?? '');
      if (!checkPassword(submitted, env.ADMIN_PASSWORD ?? '')) {
        return htmlResponse(renderLogin('Wrong password.'), { status: 401 });
      }
      const cookieValue = await buildSessionCookieValue(env.ADMIN_PASSWORD);
      return new Response(null, {
        status: 302,
        headers: {
          location: '/admin/users',
          'set-cookie': buildSessionSetCookieHeader(cookieValue),
        },
      });
    }
    return new Response('Method not allowed', { status: 405 });
  }

  if (path === '/admin/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/admin/login',
        'set-cookie': buildLogoutSetCookieHeader(),
      },
    });
  }

  // Everything below requires a valid session cookie.
  const authed = await verifySessionCookie(request, env.ADMIN_PASSWORD ?? '');
  if (!authed) {
    return new Response(null, {
      status: 302,
      headers: { location: '/admin/login' },
    });
  }

  if (path === '/admin' || path === '/admin/') {
    return new Response(null, {
      status: 302,
      headers: { location: '/admin/users' },
    });
  }

  if (path === '/admin/users') {
    const [users, totals] = await Promise.all([
      listUsers(env.DB),
      totalCounts(env.DB),
    ]);
    return htmlResponse(renderUsersList({ users, totals }));
  }

  // /admin/users/<id>
  const userMatch = path.match(/^\/admin\/users\/([a-z0-9-]+)$/i);
  if (userMatch) {
    const userId = userMatch[1];
    const [user, data, toolCalls] = await Promise.all([
      getUserDetail(env.DB, userId),
      getUserData(env.DB, userId, 50),
      recentToolCallsForUser(env.DB, userId, 50),
    ]);
    if (!user) {
      return htmlResponse(`<p style="padding:24px;">User not found.</p>`, {
        status: 404,
      });
    }
    return htmlResponse(renderUserDetail(user, data, toolCalls));
  }

  if (path === '/admin/activity') {
    const rows = await recentActivity(env.DB, 100);
    return htmlResponse(renderActivity(rows));
  }

  if (path === '/admin/calls') {
    const rows = await recentToolCallsAll(env.DB, 100);
    return htmlResponse(renderCallsFeed(rows));
  }

  return new Response('Not found', { status: 404 });
}
