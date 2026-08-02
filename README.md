# Scratchpad

A full-stack blogging portal — a Medium-style public site plus an admin portal for
writing and managing posts, backed by MongoDB. It also exposes an **MCP endpoint** so an
external AI assistant can draft posts directly into the blog, with a toggle in the portal
to turn that access on and off.

Built with Next.js (App Router), MongoDB, and TypeScript.

## What's here

| Surface | Path | What it does |
|---|---|---|
| Public site | `/` | Feed of published posts, serif long-form reading view, tag pages |
| Post page | `/blog/[slug]` | Rendered Markdown, cover image, sources |
| Search | `/search?q=` | Full-text across titles, summaries, tags, and body |
| Admin portal | `/admin` | Post list with status and counts |
| Editor | `/admin/posts/[id]/edit` | Write, publish, unpublish, delete |
| Settings | `/admin/settings` | Site title, byline, description, and the **MCP toggle** |
| REST API | `/api/posts` | Full CRUD, session-authenticated |
| MCP endpoint | `/api/mcp` | For external AI clients — off until you enable it |

## Setup

```bash
npm install
cp .env.example .env
```

Fill in two values in `.env`:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/blog
SESSION_SECRET=$(openssl rand -hex 32)
```

Any MongoDB works — a local `mongod`, `docker run -p 27017:27017 mongo`, or an Atlas
connection string. Indexes are created automatically on first connect.

Create your admin account and start:

```bash
npm run create-admin -- --email you@example.com --password 'a-long-password'
npm run dev
```

Then open http://localhost:3000 for the site and http://localhost:3000/admin to write.

Deploying to a server? See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — it covers running
this as a long-running Node process behind nginx, with systemd, TLS, and the proxy
settings the MCP endpoint needs.

`npm run build` ends by packaging everything the server needs into `release/` — entry
point, pruned `node_modules`, compiled app, static assets. Ship that directory and run
`node server.js` inside it; nothing is installed on the target. It's 83 MB against 717 MB
for a full `node_modules`.

Coming from the old file-based CLI? Import your Markdown posts once:

```bash
npm run import-markdown          # reads content/posts/, skips anything already imported
```

## Reading experience

- **Empty state** — with nothing published, the home page gives itself over to a
  rotating thought typed out character by character. Readers who prefer reduced
  motion get one thought, static; screen readers get one stable sentence rather
  than a keystroke-by-keystroke announcement.
- **Search** sits in the header on every page and covers post titles, summaries,
  tags, and full body text. Matching topics are surfaced as shortcuts to their tag
  page. Press `/` anywhere to jump to the search box.
- **Theme toggle** in the header switches light/dark and remembers the choice; it
  follows your system setting until you override it. An inline script applies the
  stored theme before first paint, so there is no flash on load.
- **Writing is single-author**, so the "Write" button only appears when you are
  signed in, and there is no sign-in link anywhere on the public site. Readers never
  see a control they cannot use. Reach the portal by going to `/admin` directly.
  It is also the *only* way to start a post — the admin nav and dashboard used to
  repeat the same action under a different name, so one control now lives in one place.
- **Brand** — "Scratchpad" and the author byline are only *defaults*. Both are editable at
  **Settings → Site** and stored in the database, so renaming needs no code change —
  the monogram is derived from the title's first letter, so it follows along
  automatically. Internal identifiers (database name, MCP server id, theme storage
  key) deliberately stay generic so they do not churn on a rebrand.

## Managing posts

The portal is the source of truth. Posts are `draft`, `published`, or `archived`; only
published posts are reachable publicly — a draft's URL returns 404 rather than leaking it.

Publishing stamps the publish date once and never moves it, so editing a live post doesn't
reorder your feed.

AI-assisted writing happens over the **MCP endpoint** rather than inside this app: your
own AI client does the drafting and calls `create_post`. That keeps the portal free of an
Anthropic API key, and puts the token cost on the client's subscription. Posts arriving
that way carry `unsupportedClaims`, shown as an amber flag in the editor so an unsourced
claim is visible before you publish.

## The MCP endpoint

`/api/mcp` lets an external AI portal connect to this blog over the Model Context Protocol
and write posts into it. It is **disabled by default**.

Go to **Settings → MCP endpoint**, flip the toggle on, and copy the generated bearer token
(shown once). Point your client at it:

```json
{
  "mcpServers": {
    "blog": {
      "type": "http",
      "url": "https://your-site.com/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### Tools a connected client gets

| Tool | Effect |
|---|---|
| `get_voice_guide` | Voice, audience, banned phrases, length targets |
| `list_posts` / `get_post` | Read existing posts |
| `create_post` | **Always creates a draft** — never publishes |
| `update_post` | Revise a stored post |
| `set_post_status` | Publish/unpublish — only when you allow it |
| `delete_post` | Permanent delete — only when you allow it |

### What the toggle actually does

Off means off: `/api/mcp` refuses every request with a 503, regardless of token. That's the
point — you can disconnect an integration instantly without rotating credentials or
redeploying. Turning it back on restores the same token.

Two further guards:

- **Publishing is separate.** "Allow connected clients to publish and delete" is its own
  checkbox, off by default. While it's off, `set_post_status` and `delete_post` aren't
  registered at all, so a connected AI can only write drafts — putting something on the
  public internet stays a human decision.
- **Token rotation** invalidates the old token immediately.

The switch and token live in the database, not in environment variables, so changing them
takes effect on the next request.

### Local clients over stdio

For an assistant running on the same machine (Claude Desktop, Claude Code, editors), skip
HTTP and use stdio against the same database:

```bash
npm run mcp
```

```json
{
  "mcpServers": {
    "blog": { "command": "npx", "args": ["tsx", "src/cli.ts", "mcp"], "cwd": "/path/to/blog" }
  }
}
```

## Analytics

Visits are reported to `https://analytics.consoleapi.in`, a multi-tenant platform. The
host is fixed in `src/analytics/config.ts`; the tenant ("site") ID is deployment-specific
and comes from the environment, never from a file in this repo:

```bash
NEXT_PUBLIC_ANALYTICS_SITE_ID_PRODUCTION=<uuid from the analytics dashboard>
NEXT_PUBLIC_ANALYTICS_SITE_ID_DEVELOPMENT=<uuid from the analytics dashboard>
```

`NODE_ENV` picks between them, so a production build reports under the production tenant
and `npm run dev` under the development one — one `.env` can hold both without local page
loads landing in the real numbers. `NEXT_PUBLIC_ANALYTICS_SITE_ID` sets a single tenant
and overrides the pair, for staging or a machine that only ever builds one environment.

**With no tenant set, nothing is tracked at all** — the SDK isn't even loaded, so a fresh
clone is silent until it's configured on purpose. Being `NEXT_PUBLIC_*` values, these are
baked into the browser bundle at build time: changing one means rebuilding, not just
restarting.

Two decisions worth knowing about: the SDK's own auto-tracking is switched off and visits
are reported from the Next router instead (the SDK hooks `history.pushState`, which the
router also drives, so leaving both on double-counts every navigation), and `/admin` is
never tracked — it's one person editing their own site, and those URLs carry post IDs.

## Security notes

- Admin pages are gated by middleware *and* every API route re-checks the session, so a
  routing change can't silently expose them.
- Session cookies are `httpOnly`, signed with `SESSION_SECRET` (rejected below 32 chars),
  and `Secure` in production.
- Login answers identically for an unknown email and a wrong password, and always runs a
  bcrypt comparison, so responses can't be used to enumerate accounts.
- Post bodies render as Markdown with raw HTML disabled — an AI client with write access
  can't inject script into a published page.
- The MCP bearer check is constant-time.

Put the site behind TLS before exposing it publicly; the MCP token travels as a header.

## Commands

```bash
npm run dev              # development server
npm run build            # production build, then packages release/
npm run start            # serve release/ (node release/server.js)
npm run typecheck
npm test

npm run create-admin -- --email … --password …
npm run cli set-password -- --email … --password …   # reset a forgotten password
npm run status           # which database, what's in it, and whether MCP is on
npm run import-markdown  # migrate old Markdown posts
npm run mcp              # MCP over stdio
npm run cli linkedin:auth
```

## Tests

```bash
npm test
```

102 tests covering the MCP tool surface (including that publishing and deletion are absent
unless enabled), search matching and regex escaping, session signing and tampering, slug
generation, Markdown front-matter round-tripping, the typewriter empty state (timing,
reduced-motion fallback, screen-reader text, timer cleanup on unmount), and analytics
(tenant selection, admin exclusion, one visit per navigation with none lost while the SDK
is still loading), and connection resolution (which database a URI actually lands in, with
credentials never printed).

They make no network calls and need no database — the store layer sits behind an interface
with an in-memory implementation that mirrors the MongoDB one's behaviour. Component tests
opt into jsdom per-file; everything else runs in plain Node.
