# Claude Coach

> A personal health, workout, and meal tracking [MCP](https://modelcontextprotocol.io) server for Claude. Talks to Claude.ai as a custom connector. Runs on Cloudflare Workers + D1, free tier forever.

Tell Claude what you ate, what you trained, what you slept, what your goals are — in plain English. The server logs it, and Claude always knows today's IST date, your recent activity, and your active targets without you re-explaining.

```
You: just did push and light legs, ~50min
Claude: logged — Monday push (moderate, 50min)

You: had chicken tikka with 65g protein
Claude: logged — 700kcal, 65g, you're at 95g/150g for the day

You: how am I tracking this week?
Claude: 3/5 workouts done, calories on track (1850/2500), protein behind (95/150).
```

## What's in the box

| Tool | What it does |
|---|---|
| `get_context` | Returns today's IST date, time, last-7-days workouts, today's meals/notes, active targets with progress. Claude calls this at the start of every conversation. |
| `log_workout` | Logs a workout (`push` / `pull` / `legs` / `run` / `walk` / `rest` / `mixed` / `other`) with intensity, duration, notes. |
| `log_meal` | Logs a meal with optional protein/calorie estimates that feed daily target progress. |
| `log` | Universal logger for anything else — mood, energy, sleep, observations. |
| `set_target` | Sets a goal: protein/day, calories/day, workouts/week, sleep/night, or any custom kind. |
| `clear_target` | Drops an active target. |
| `recent` | Pulls last N days of any table (1–90). |

## Architecture

- **Runtime**: Cloudflare Workers (free tier, 100K req/day)
- **Database**: Cloudflare D1 — serverless SQLite, free tier (5 GB / 5M reads / 100K writes per day)
- **Transport**: MCP Streamable HTTP, stateless, JSON response mode
- **Auth**: Static token in URL path (`/mcp/<token>`) — Claude.ai's connector UI doesn't allow custom headers, so a path token is the most compatible option

Time-of-day handling is fixed-offset IST (UTC+5:30) by default — see [Customization](#customization) to change.

## Quick start

You'll need a Cloudflare account (free) and Node 18+.

```bash
git clone https://github.com/<your-user>/claude-coach.git
cd claude-coach
npm install
```

### 1. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create claude-coach
```

Copy the printed `database_id` into [wrangler.toml](wrangler.toml), replacing `<filled-after-d1-create>`.

### 2. Apply schema

```bash
npx wrangler d1 migrations apply claude-coach --local
npx wrangler d1 migrations apply claude-coach --remote
```

### 3. Set the auth token

```bash
# Local dev:
echo "MCP_TOKEN=local-dev-token-12345" > .dev.vars

# Production — paste a 32+ char random string when prompted:
openssl rand -hex 32 | npx wrangler secret put MCP_TOKEN
```

Save the production token — you'll paste it into Claude.ai.

### 4. Run locally (optional)

```bash
npx wrangler dev
# server at http://localhost:8787/mcp/local-dev-token-12345
```

Test with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
```

### 5. Deploy

```bash
npx wrangler deploy
```

Wrangler prints your live URL, e.g. `https://claude-coach.<subdomain>.workers.dev`.

### 6. Connect to Claude.ai

[Claude.ai → Settings → Connectors → Add custom connector](https://claude.ai/customize/connectors):

- **Name**: anything (e.g. "Coach")
- **Remote MCP server URL**: `https://claude-coach.<your-subdomain>.workers.dev/mcp/<your-prod-token>`
- Leave OAuth fields blank.

After it connects, set both **Read-only tools** and **Write/delete tools** to **"Always allow"** — otherwise Claude pops a confirm prompt every time it logs something, which defeats the point.

## Customization

### Change the personality / your name

Edit [src/instructions.ts](src/instructions.ts). That string is sent to Claude on every connection — change the tone, swap "the user" for your name, drop the gym-bro vibe, whatever. Redeploy to apply.

### Change the timezone

Replace IST helpers in [src/time.ts](src/time.ts). For other fixed-offset zones (no DST), just change the `IST_OFFSET_MS` constant. For DST-aware zones use `Intl.DateTimeFormat` with the IANA name.

### Add a new target kind with auto-progress

Two-line change in [src/tools/context.ts](src/tools/context.ts) — add a branch in `computeTargetProgress` that pulls the relevant value (e.g. `water_l` could sum a `logs.kind='water'` field).

### Rotate the auth token

```bash
openssl rand -hex 32 | npx wrangler secret put MCP_TOKEN
```

Old URL stops working immediately; update the connector URL in Claude.ai.

## Backups

```bash
npx wrangler d1 export claude-coach --remote --output=backup-$(date +%Y%m%d).sql
```

Drop that file in iCloud/Dropbox once a month. To restore on a fresh D1: `wrangler d1 execute claude-coach --remote --file=backup.sql`.

## Free-tier headroom

For typical solo use (~50–200 requests/day):

| Resource | Free limit | Daily usage | Headroom |
|---|---|---|---|
| Worker requests | 100,000 / day | ~100 | 1000× |
| D1 storage | 5 GB | ~50 KB / month | ~8000 years |
| D1 reads | 5M / day | ~500 | 10,000× |
| D1 writes | 100,000 / day | ~50 | 2000× |

The deployed bundle is ~165 KiB gzipped, well under Cloudflare's 1 MiB free-tier worker size limit.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
