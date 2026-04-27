# Build Notes & Assumptions

This file documents the non-obvious choices made while building `health-mcp`.

## Stack pins

- **MCP SDK**: `@modelcontextprotocol/sdk` v1.x (`^1.29.0`). The repo's `main`
  branch is v2 pre-alpha at the time of writing — v2 ships under different
  package names (`@modelcontextprotocol/server`, `@modelcontextprotocol/express`,
  etc.). v1 is what's published as `latest` on npm and is what this server uses.
- **Transport**: `WebStandardStreamableHTTPServerTransport` from
  `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`. This is the
  Web Standards (Request/Response) variant that the SDK explicitly documents
  for Cloudflare Workers, Deno, Bun. The Express-flavoured
  `StreamableHTTPServerTransport` would not work here.
- **JSON Schema validator**: `CfWorkerJsonSchemaValidator` from
  `@modelcontextprotocol/sdk/validation/cfworker.js`. The SDK default is Ajv,
  which uses `Function`/`eval` for its compiled schemas — that is blocked on
  the Workers runtime. The cfworker validator is the SDK's supported edge
  alternative and pulls in `@cfworker/json-schema` as a peer dep.
- **Zod**: pinned to `^3.25` (the SDK accepts `^3.25 || ^4.0`). Tools use
  raw zod shapes (`{ field: z.string() }`) rather than `z.object(...)` — this
  is the shape `registerTool` expects in v1.x.

## Statelessness

`sessionIdGenerator: undefined` puts the transport into stateless mode: no
session IDs, no in-memory state across requests. Each Worker request creates
a fresh `McpServer` + transport pair, calls `connect()`, dispatches
`handleRequest(request)`, and closes both via `ctx.waitUntil` after the
response is returned. This matches the SDK's documented Cloudflare pattern
and means the only persistent state is in D1.

The Streamable HTTP transport's `enableJsonResponse` was left at its default
(`false`). That keeps the server compatible with the Streamable HTTP spec's
SSE-preferred mode that Claude.ai and the MCP Inspector both negotiate.

## Auth

URL-path token (`/mcp/<token>`) compared against `env.MCP_TOKEN` in
constant time. Constant-time compare is implemented manually — Workers
expose `crypto.subtle` but no `timingSafeEqual` — by XOR-summing the bytes
across `max(len(a), len(b))` and mixing the length difference into the
accumulator so unequal-length strings still take the full pass.

## Time handling (IST)

- IST is UTC+5:30 with no DST, so the conversion is a fixed-offset add
  (`19_800_000` ms). No `Intl.DateTimeFormat` calls — pure arithmetic, which
  is faster, has no surprises across runtimes, and avoids pulling in any
  polyfill weight.
- "IST wall-clock" components are obtained by shifting the UTC timestamp by
  the offset and reading `getUTC*()` from the shifted Date. This gives the
  correct day-of-month and day-of-week even right around UTC midnight.
- `daysAgoIST(n)` subtracts `n * 86_400_000` ms after the offset is applied.
  For the 1–90 day range supported here this never crosses a DST or
  leap-second boundary in IST (because IST has neither).
- Sanity checks are documented as a comment block at the bottom of `time.ts`
  rather than wired up as a test suite — this server has no test runner
  configured and a runtime self-test wasn't asked for.

## Storage shape

- All `*_at` timestamps are UTC ISO-8601 strings (ms component stripped for
  compactness).
- All `*_on` date strings are computed as IST `YYYY-MM-DD` from the
  corresponding `*_at` value at insert time. The `*_on` field is always the
  one used for filtering "today" / "last 7 days" — never the UTC `*_at`.
- Primary keys are `crypto.randomUUID()` strings.
- D1's `created_at` default `(datetime('now'))` is in UTC; we keep it for
  forensic purposes but the application reads `*_at` for time logic.
- `meals.eaten_on` and `logs.recorded_on` are derived inside `db.ts` from the
  `*_at` value the caller provides (or `now` if not). The schema only
  declares `meals.eaten_at` and `logs.recorded_at` as inputs — the `*_on`
  partition is computed server-side so the client never has to do IST math.

## `get_context` payload size

A workout row is small (~100 bytes JSON), a meal row similar, a log row
smaller. With the 7-day workouts cap, today-only meals/logs, and 5
recent_notes, the payload comfortably stays well under 4KB at typical usage
volumes. No truncation/pagination logic was added since the spec's
acceptance criterion 8 only requires <4KB after ~10 days of dummy data.

## What was deliberately left out

- **No prompts or resources registered.** The product spec only lists tools.
- **No request rate limiting.** Single-user server behind a token; CF's
  built-in DDoS protection covers the rest.
- **No CORS headers.** Claude.ai's connector does the MCP handshake from the
  server side; there's no browser context that would need CORS.
- **No structured `outputSchema` on tools.** Tool responses are returned as
  text content with embedded JSON, which is what Claude reads. Adding
  `outputSchema` would give Claude a typed structured-output channel as well
  but the product spec described responses as JSON-shaped text only.
- **No automated tests.** The spec's acceptance criteria are end-to-end
  (Inspector + Claude.ai). A Node-runnable unit test of `time.ts` would be
  valuable but wasn't asked for.

## Things to fill in after `wrangler d1 create health`

1. Replace the `database_id` placeholder in `wrangler.toml`.
2. Run `npx wrangler d1 migrations apply health --local` for local dev.
3. Copy `.dev.vars.example` to `.dev.vars` (or set your own token).
4. For prod: `npx wrangler secret put MCP_TOKEN` and
   `npx wrangler d1 migrations apply health --remote`.
