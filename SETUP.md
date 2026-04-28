# Self-hosting Fitness Coach

Deploy your own Fitness Coach MCP server on Cloudflare Workers + D1 + KV. Free tier covers solo or small-group use indefinitely.

## What you'll need
- Cloudflare account (free)
- Google Cloud account (free) for OAuth
- Node 18+

## 1. Clone and install

```bash
git clone https://github.com/<your-user>/fitness-coach.git
cd fitness-coach
npm install
```

## 2. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create fitness-coach
```

Paste the printed `database_id` into [wrangler.toml](wrangler.toml).

## 3. Create the KV namespace (OAuth state)

```bash
npx wrangler kv namespace create OAUTH_KV
```

Paste the printed `id` into [wrangler.toml](wrangler.toml) under `[[kv_namespaces]]`.

## 4. Apply schema

```bash
npx wrangler d1 migrations apply fitness-coach --local
npx wrangler d1 migrations apply fitness-coach --remote
```

## 5. Set up Google OAuth

In [Google Cloud Console](https://console.cloud.google.com):

1. Create a new project (or pick an existing one).
2. **APIs & Services → OAuth consent screen** — pick "External", fill in app name and your email, save.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `fitness-coach`
   - Authorized redirect URI: `https://fitness-coach.<your-subdomain>.workers.dev/oauth/google/callback`
4. Save → copy the **Client ID** and **Client Secret**.

## 6. Set secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

## 7. Deploy

```bash
npx wrangler deploy
```

Wrangler prints your live URL.

## 8. Connect to Claude

[Claude → Connectors](https://claude.ai/settings/connectors) → **+ Add custom connector**:

- **Name**: anything (e.g. "Coach")
- **Remote MCP server URL**: `https://fitness-coach.<your-subdomain>.workers.dev/mcp`
- Leave OAuth fields blank — Claude discovers them via `/.well-known/oauth-authorization-server`.

After connecting, set both **Read-only tools** and **Write/delete tools** to **"Always allow"** in the connector settings.

---

## Restricting who can sign up

By default anyone with a Google account can self-sign-up via your URL. To limit access, edit [src/oauth/handler.ts](src/oauth/handler.ts) right after `fetchGoogleUserInfo`:

```ts
const ALLOWED_EMAILS = ['you@example.com', 'friend@example.com'];
if (!ALLOWED_EMAILS.includes(userInfo.email)) {
  return new Response('Sign-ups are limited to invited accounts.', { status: 403 });
}
```

---

## Customization

**Personality / tone** — edit [src/instructions.ts](src/instructions.ts) (the system prompt Claude reads on every connection). Redeploy to apply.

**Per-user timezone** — defaults to `Asia/Kolkata`. To use the user's Google locale, set `timezone` from `userInfo.locale` in `upsertUserByGoogle` in [src/db.ts](src/db.ts).

**Custom target with auto-progress** — add a branch in `computeTargetProgress` in [src/tools/context.ts](src/tools/context.ts) (e.g. `water_l` could sum a `logs.kind='water'` field).

---

## Tools (MCP)

| Tool | What it does |
|------|--------------|
| `get_context` | Today's date, last-7-days workouts, today's meals/notes, target progress. Claude calls this at the start of every conversation. |
| `log_workout` | Logs a workout (`push` / `pull` / `legs` / `run` / `walk` / `rest` / `mixed` / `other`) with intensity, duration, notes. |
| `log_meal` | Logs a meal with calorie/protein/carbs/fat estimates that feed daily target progress. |
| `log` | Universal logger for anything else — mood, energy, sleep, observations. |
| `set_target` | Sets a daily/weekly goal: protein, calories, workouts, sleep, or custom kind. |
| `clear_target` | Drops an active target. |
| `recent` | Pulls last N days of any table (1–90). |

---

## Architecture

- **Runtime**: Cloudflare Workers (free tier, 100K req/day)
- **Database**: Cloudflare D1 (5 GB / 5M reads / 100K writes per day, free tier)
- **Auth state**: Cloudflare KV (`@cloudflare/workers-oauth-provider` stores clients/grants/tokens)
- **Transport**: MCP Streamable HTTP, stateless, JSON response mode
- **Auth**: OAuth 2.1 with Google as upstream IdP. Dynamic Client Registration so Claude self-registers on connect.
- **Per-user isolation**: every row in `workouts` / `meals` / `logs` / `targets` carries `user_id`; queries filter on it.

---

## Backups

```bash
npx wrangler d1 export fitness-coach --remote --output=backup-$(date +%Y%m%d).sql
```

Drop in iCloud/Dropbox monthly. Restore: `wrangler d1 execute fitness-coach --remote --file=backup.sql`.

---

## Free-tier headroom

For typical solo or small-group use:

| Resource | Free limit | Daily usage (10 users) | Headroom |
|----------|------------|------------------------|----------|
| Worker requests | 100,000 / day | ~1,000 | 100× |
| D1 storage | 5 GB | ~100 KB / month | ~50,000 yrs |
| D1 reads | 5M / day | ~5,000 | 1000× |
| D1 writes | 100,000 / day | ~500 | 200× |
| KV reads | 100,000 / day | ~5,000 | 20× |
| KV writes | 1,000 / day | ~50 | 20× |

Bundle is ~185 KiB gzipped, well under Cloudflare's 1 MiB free-tier worker size cap.

---

## Acknowledgements

Built on the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider).
