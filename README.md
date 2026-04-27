# Fitness Coach

> A personal health, workout, and meal tracking [MCP](https://modelcontextprotocol.io) server for Claude. Talks to Claude.ai as a custom connector with **Google OAuth multi-user sign-in**. Runs on Cloudflare Workers + D1 + KV, free tier forever.

Tell Claude what you ate, what you trained, what you slept, what your goals are — in plain English. The server logs it under your account, and Claude always knows today's date, your recent activity, and your active targets without you re-explaining.

```
You: just did push and light legs, ~50min
Claude: logged — Monday push (moderate, 50min)

You: had chicken tikka with 65g protein
Claude: logged — 700kcal, 65g, you're at 95g/150g for the day

You: how am I tracking this week?
Claude: 3/5 workouts done, calories on track (1850/2500), protein behind (95/150).
```

## Tools

| Tool | What it does |
|---|---|
| `get_context` | Returns today's local date, time, last-7-days workouts, today's meals/notes, active targets with progress. Claude calls this at the start of every conversation. |
| `log_workout` | Logs a workout (`push` / `pull` / `legs` / `run` / `walk` / `rest` / `mixed` / `other`) with intensity, duration, notes. |
| `log_meal` | Logs a meal with optional protein/calorie estimates that feed daily target progress. |
| `log` | Universal logger for anything else — mood, energy, sleep, observations. |
| `set_target` | Sets a goal: protein/day, calories/day, workouts/week, sleep/night, or any custom kind. |
| `clear_target` | Drops an active target. |
| `recent` | Pulls last N days of any table (1–90). |

## Architecture

- **Runtime**: Cloudflare Workers (free tier, 100K req/day)
- **Database**: Cloudflare D1 (5 GB / 5M reads / 100K writes per day, free tier)
- **Auth state**: Cloudflare KV (`@cloudflare/workers-oauth-provider` stores clients/grants/tokens here, free tier)
- **Transport**: MCP Streamable HTTP, stateless, JSON response mode
- **Auth**: OAuth 2.1 with Google as upstream IdP. Dynamic Client Registration so Claude.ai self-registers on connect.
- **Per-user data isolation**: every row in `workouts` / `meals` / `logs` / `targets` carries `user_id`; queries filter on it.
- **Per-user timezone**: stored on each user; defaults to `Asia/Kolkata` and resolved via `Intl.DateTimeFormat`.

## Quick start

You'll need:
- Cloudflare account (free)
- Google Cloud account (free) for OAuth credentials
- Node 18+
- A custom domain *or* the default `*.workers.dev` URL is fine

```bash
git clone https://github.com/<your-user>/fitness-coach.git
cd fitness-coach
npm install
```

### 1. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create fitness-coach
```

Paste the printed `database_id` into [wrangler.toml](wrangler.toml).

### 2. Create the KV namespace (for OAuth state)

```bash
npx wrangler kv namespace create OAUTH_KV
```

Paste the printed `id` into [wrangler.toml](wrangler.toml) under the `[[kv_namespaces]]` block.

### 3. Apply schema

```bash
npx wrangler d1 migrations apply fitness-coach --local
npx wrangler d1 migrations apply fitness-coach --remote
```

### 4. Set up Google OAuth credentials

In **[Google Cloud Console](https://console.cloud.google.com)**:

1. Create a new project (or pick an existing one)
2. **APIs & Services → OAuth consent screen** — pick "External", fill in app name, your email, save.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `fitness-coach`
   - Authorized redirect URIs: add your production URL's `/oauth/google/callback` path, e.g.
     ```
     https://fitness-coach.<your-subdomain>.workers.dev/oauth/google/callback
     ```
   - Save → copy the **Client ID** and **Client Secret**.

### 5. Set the secrets in Wrangler

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
# paste the Client ID from step 4

npx wrangler secret put GOOGLE_CLIENT_SECRET
# paste the Client Secret from step 4
```

### 6. Deploy

```bash
npx wrangler deploy
```

Wrangler prints your live URL, e.g. `https://fitness-coach.<your-subdomain>.workers.dev`.

### 7. Connect to Claude.ai

[Claude.ai → Settings → Connectors → + Add custom connector](https://claude.ai/customize/connectors):

- **Name**: anything (e.g. "Coach")
- **Remote MCP server URL**: `https://fitness-coach.<your-subdomain>.workers.dev/mcp`
- Leave OAuth fields blank — Claude.ai discovers them via `/.well-known/oauth-authorization-server`.

Click Add. Claude.ai will pop up a Google sign-in window. Pick your Google account, authorize, and the connector connects under your identity.

After connecting: set both **Read-only tools** and **Write/delete tools** to **"Always allow"** in the connector settings — otherwise Claude pops a confirm prompt every time it logs something.

## How users sign up

Once your server is deployed, **anyone with a Google account can self-sign-up**: they go to Claude.ai → Add custom connector → paste your URL → Google sign-in → done. The first request creates their `users` row. Their data is isolated from yours and from every other user.

If you want to restrict who can sign up (e.g. only your Google Workspace domain or a list of emails), add a check in [src/oauth/handler.ts](src/oauth/handler.ts) right after `fetchGoogleUserInfo`:

```ts
const ALLOWED_EMAILS = ['you@example.com', 'friend@example.com'];
if (!ALLOWED_EMAILS.includes(userInfo.email)) {
  return new Response('Sign-ups are limited to invited accounts.', { status: 403 });
}
```

## Customization

### Personality / tone

Edit [src/instructions.ts](src/instructions.ts) — that's the system prompt Claude reads on every connection. Change the rules, tone, references. Redeploy to apply.

### Per-user timezone

The first-sign-in default is `Asia/Kolkata`. To make it depend on the user's Google locale, set `timezone` from `userInfo.locale` (or any IANA name) in `upsertUserByGoogle` in [src/db.ts](src/db.ts).

### Add a target kind with auto-progress

Two-line change in [src/tools/context.ts](src/tools/context.ts) — add a branch in `computeTargetProgress` that pulls the relevant value (e.g. `water_l` could sum a `logs.kind='water'` field).

## Backups

```bash
npx wrangler d1 export fitness-coach --remote --output=backup-$(date +%Y%m%d).sql
```

Drop in iCloud/Dropbox monthly. Restore: `wrangler d1 execute fitness-coach --remote --file=backup.sql`.

## Free-tier headroom

For typical solo or small-group use:

| Resource | Free limit | Daily usage (10 users) | Headroom |
|---|---|---|---|
| Worker requests | 100,000 / day | ~1,000 | 100× |
| D1 storage | 5 GB | ~100 KB / month | ~50,000 yrs |
| D1 reads | 5M / day | ~5,000 | 1000× |
| D1 writes | 100,000 / day | ~500 | 200× |
| KV reads | 100,000 / day | ~5,000 | 20× |
| KV writes | 1,000 / day | ~50 | 20× |

Bundle is ~185 KiB gzipped, well under Cloudflare's 1 MiB free-tier worker size cap.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider).
