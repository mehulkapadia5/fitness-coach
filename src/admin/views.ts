// Server-rendered HTML for the admin dashboard. No framework, no client-
// side JS (except a tiny bit for auto-refresh on the activity feed).
// Inline CSS keeps the bundle self-contained.

import type {
  ActivityRow,
  UserData,
  UserDetail,
  UserSummary,
} from './queries.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escape(s: string | null | undefined): string {
  return s == null ? '' : escapeHtml(String(s));
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '—';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const BASE_CSS = `
  :root {
    color-scheme: light dark;
    --fg: #1c1c1c;
    --fg-muted: #5e5e5e;
    --bg: #fafafa;
    --card: #fff;
    --border: #e5e5e5;
    --accent: #086f3a;
    --danger: #b22a2a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fg: #f3f3f3;
      --fg-muted: #a0a0a0;
      --bg: #18181a;
      --card: #232326;
      --border: #34343a;
      --accent: #4ade80;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  header.topbar { display: flex; align-items: center; gap: 16px; padding: 14px 24px; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
  header.topbar h1 { margin: 0; font-size: 18px; font-weight: 600; }
  header.topbar nav a { margin-right: 16px; color: var(--fg); text-decoration: none; font-size: 14px; }
  header.topbar nav a.active { color: var(--accent); font-weight: 600; }
  header.topbar .spacer { flex: 1; }
  header.topbar .logout { color: var(--fg-muted); font-size: 13px; }
  main { padding: 24px; max-width: 1200px; margin: 0 auto; }
  h2 { margin-top: 0; font-size: 20px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
  .stat .label { color: var(--fg-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: top; }
  thead th { background: rgba(0,0,0,0.03); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); }
  @media (prefers-color-scheme: dark) { thead th { background: rgba(255,255,255,0.04); } }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,0.06); font-size: 12px; }
  @media (prefers-color-scheme: dark) { .pill { background: rgba(255,255,255,0.08); } }
  .pill.workout { background: rgba(8, 111, 58, 0.15); color: var(--accent); }
  .pill.meal { background: rgba(180, 110, 0, 0.15); color: #b46e00; }
  .pill.log { background: rgba(50, 90, 200, 0.15); color: #325ac8; }
  .pill.target { background: rgba(160, 50, 160, 0.15); color: #a032a0; }
  .muted { color: var(--fg-muted); }
  section { margin-bottom: 32px; }
  section h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin: 0 0 8px; }
  .login { max-width: 360px; margin: 80px auto; padding: 28px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
  .login h2 { margin-top: 0; }
  .login label { display: block; font-size: 13px; color: var(--fg-muted); margin-bottom: 6px; }
  .login input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 15px; }
  .login button { width: 100%; margin-top: 16px; padding: 10px; border: none; border-radius: 6px; background: var(--accent); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
  .login .err { color: var(--danger); font-size: 13px; margin-top: 12px; }
  img.avatar { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
  .empty { padding: 24px; text-align: center; color: var(--fg-muted); font-size: 14px; }
`;

function layout(args: {
  title: string;
  active: 'users' | 'activity' | '';
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(args.title)} · Fitness Coach Admin</title>
<style>${BASE_CSS}</style>
</head>
<body>
<header class="topbar">
  <h1>Fitness Coach Admin</h1>
  <nav>
    <a href="/admin/users" class="${args.active === 'users' ? 'active' : ''}">Users</a>
    <a href="/admin/activity" class="${args.active === 'activity' ? 'active' : ''}">Activity</a>
  </nav>
  <span class="spacer"></span>
  <a href="/admin/logout" class="logout">Sign out</a>
</header>
<main>
${args.body}
</main>
</body>
</html>`;
}

export function renderLogin(error?: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in · Fitness Coach Admin</title>
<style>${BASE_CSS}</style>
</head><body>
<form method="POST" action="/admin/login" class="login">
  <h2>Admin sign in</h2>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
  <button type="submit">Sign in</button>
  ${error ? `<div class="err">${escape(error)}</div>` : ''}
</form>
</body></html>`;
}

export function renderUsersList(args: {
  users: UserSummary[];
  totals: { users: number; workouts: number; meals: number; logs: number; targets: number };
}): string {
  const stats = `
    <div class="stat-grid">
      <div class="stat"><div class="label">Users</div><div class="value">${args.totals.users}</div></div>
      <div class="stat"><div class="label">Workouts</div><div class="value">${args.totals.workouts}</div></div>
      <div class="stat"><div class="label">Meals</div><div class="value">${args.totals.meals}</div></div>
      <div class="stat"><div class="label">Logs</div><div class="value">${args.totals.logs}</div></div>
      <div class="stat"><div class="label">Targets</div><div class="value">${args.totals.targets}</div></div>
    </div>
  `;

  const rows = args.users.length
    ? args.users
        .map(
          (u) => `
      <tr>
        <td>
          ${u.picture_url ? `<img class="avatar" src="${escape(u.picture_url)}" alt="" />` : ''}
          <a href="/admin/users/${escape(u.id)}">${escape(u.name ?? u.email)}</a>
          <div class="muted" style="font-size: 12px;">${escape(u.email)}</div>
        </td>
        <td>${escape(u.timezone)}</td>
        <td>${shortDate(u.created_at)}</td>
        <td>${relTime(u.last_login_at)}</td>
        <td class="num">${u.workouts_count}</td>
        <td class="num">${u.meals_count}</td>
        <td class="num">${u.logs_count}</td>
        <td class="num">${u.targets_count}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="8" class="empty">No users have signed up yet.</td></tr>`;

  const body = `
    <h2>Users</h2>
    ${stats}
    <table>
      <thead><tr>
        <th>User</th>
        <th>Timezone</th>
        <th>Joined</th>
        <th>Last login</th>
        <th class="num">Workouts</th>
        <th class="num">Meals</th>
        <th class="num">Logs</th>
        <th class="num">Targets</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return layout({ title: 'Users', active: 'users', body });
}

export function renderUserDetail(
  user: UserDetail,
  data: UserData,
): string {
  const renderTable = <T,>(
    title: string,
    rows: T[],
    headers: string[],
    cells: (row: T) => string[],
  ): string => `
    <section>
      <h3>${escape(title)} (${rows.length})</h3>
      <table>
        <thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) =>
                      `<tr>${cells(row)
                        .map((c) => `<td>${c}</td>`)
                        .join('')}</tr>`,
                  )
                  .join('')
              : `<tr><td colspan="${headers.length}" class="empty">No rows.</td></tr>`
          }
        </tbody>
      </table>
    </section>
  `;

  const body = `
    <a href="/admin/users" class="muted">← Back to users</a>
    <h2 style="margin-top: 8px;">
      ${user.picture_url ? `<img class="avatar" src="${escape(user.picture_url)}" alt="" />` : ''}
      ${escape(user.name ?? user.email)}
    </h2>
    <div class="muted" style="margin-bottom: 24px;">
      ${escape(user.email)} · ${escape(user.timezone)} · joined ${shortDate(user.created_at)} · last seen ${relTime(user.last_login_at)}
    </div>

    ${renderTable('Workouts', data.workouts, ['When', 'Type', 'Intensity', 'Duration', 'Notes'], (w) => [
      `${escape(w.done_on)}<div class="muted" style="font-size:12px;">${shortDate(w.done_at)}</div>`,
      `<span class="pill workout">${escape(w.type)}</span>`,
      escape(w.intensity ?? '—'),
      w.duration_min != null ? `${w.duration_min} min` : '—',
      escape(w.notes ?? ''),
    ])}

    ${renderTable('Meals', data.meals, ['When', 'Description', 'Protein', 'Calories', 'Notes'], (m) => [
      `${escape(m.eaten_on)}<div class="muted" style="font-size:12px;">${shortDate(m.eaten_at)}</div>`,
      escape(m.description),
      m.protein_g != null ? `${m.protein_g} g` : '—',
      m.calories_kcal != null ? `${m.calories_kcal} kcal` : '—',
      escape(m.notes ?? ''),
    ])}

    ${renderTable('Logs', data.logs, ['When', 'Kind', 'Value'], (l) => [
      `${escape(l.recorded_on)}<div class="muted" style="font-size:12px;">${shortDate(l.recorded_at)}</div>`,
      `<span class="pill log">${escape(l.kind)}</span>`,
      escape(l.value),
    ])}

    ${renderTable('Targets', data.targets, ['Kind', 'Target', 'Period', 'Set on', 'Status'], (t) => [
      `<span class="pill target">${escape(t.kind)}</span>`,
      `${escape(t.comparison)} ${t.target_value} ${escape(t.unit)}`,
      escape(t.period),
      escape(t.set_on),
      t.deactivated_at ? `<span class="muted">cleared ${shortDate(t.deactivated_at)}</span>` : 'active',
    ])}
  `;

  return layout({
    title: `${user.name ?? user.email} · Users`,
    active: 'users',
    body,
  });
}

export function renderActivity(rows: ActivityRow[]): string {
  const body = `
    <h2>Recent activity</h2>
    <p class="muted" style="margin-top: -8px;">Last ${rows.length} events across all users. Auto-refreshes every 30s.</p>
    <table>
      <thead><tr>
        <th>When</th><th>User</th><th>Kind</th><th>What</th>
      </tr></thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (r) => `
          <tr>
            <td>${relTime(r.ts)}<div class="muted" style="font-size:12px;">${shortDate(r.ts)}</div></td>
            <td><a href="/admin/users/${escape(r.user_id)}">${escape(r.user_name ?? r.user_email)}</a></td>
            <td><span class="pill ${escape(r.source)}">${escape(r.source)}</span></td>
            <td>${escape(r.summary)}</td>
          </tr>`,
                )
                .join('')
            : `<tr><td colspan="4" class="empty">No activity yet.</td></tr>`
        }
      </tbody>
    </table>
    <script>setTimeout(() => location.reload(), 30000);</script>
  `;
  return layout({ title: 'Activity', active: 'activity', body });
}
