# BlogWriter

AI-assisted content pipeline for [gokulakannan.dev](https://gokulakannan.dev) and LinkedIn.
Claude researches, drafts, edits, and fact-checks a post; you review it; it publishes.

Full design in [`docs/PLAN.md`](docs/PLAN.md). **All phases implemented:** draft locally, review via PR, publish to website + LinkedIn with one command.

## Setup

```bash
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
```

Then fill in `config/profile.yml`. The `voice.samples` field is the single biggest lever on
output quality — paste in two or three things you've actually written. Without them the
drafts will be competent and generic.

## Usage

### 1. Draft a post

```bash
npm run draft -- --topic "Why retrieval quality beats context window size"
npm run status              # every post and where it stands
```

Drafts land in `content/posts/<slug>.md` as Markdown with YAML front matter. Edit freely —
the store tolerates hand-editing, including unquoted dates.

**Flags:**
- `--no-research`: Skip web search (cheaper; for opinion pieces)
- `--slug <slug>`: Override the generated slug
- `-q, --quiet`: Suppress progress output

### 2. Review in GitHub

Push the draft to a branch and open a PR. The content is reviewable as a diff, unsupported
claims are highlighted in the frontmatter, and you can request changes or approve for
publishing.

### 3. Publish to website + LinkedIn

Once the PR is approved and merged to `main`, run:

```bash
npm run publish -- --slug "<slug>"
```

This will:
1. Upsert to the blog API (idempotent, safe to retry)
2. Repurpose to a LinkedIn post (~1300 chars, optimized for the platform)
3. Post to your LinkedIn profile (respects `visibility: PUBLIC | CONNECTIONS`)
4. Add the blog link as a first comment (LinkedIn suppresses reach on posts with links)
5. Update frontmatter with URLs, URNs, and timestamps

**Flags:**
- `--no-linkedin`: Skip LinkedIn publishing (website only)
- `-q, --quiet`: Suppress progress output

### 4. Set up LinkedIn credentials

LinkedIn OAuth is interactive and local-only (your machine must reach LinkedIn for the callback):

```bash
npm run auth:linkedin
```

This runs the authorization flow and prints the token + person URN — add them to `.env` or
GitHub Secrets for CI:

```
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_PERSON_URN=urn:li:person:...
```

## MCP server — let another AI write and publish

The pipeline is also an [MCP](https://modelcontextprotocol.io) server, so any MCP-capable
assistant (Claude Desktop, Claude Code, an editor, or a hosted model reached over HTTP) can
read the voice guide, write posts into the content store, and — if you allow it — publish.

```bash
npm run mcp                     # stdio, for a client that launches the process
npm run mcp -- --http           # Streamable HTTP on 127.0.0.1:8848
```

### Tools

| Tool | Effect |
|---|---|
| `get_voice_guide` | Voice, audience, banned phrases, length targets, topic backlog. Read first. |
| `list_posts` | Every post and its status; optionally filtered. |
| `get_post` | Full Markdown body and metadata for one post. |
| `create_post` | **The main one.** Saves a post the calling model wrote, as a draft. |
| `update_post` | Revise a stored draft. Published posts are immutable. |
| `set_post_status` | Move through `idea → drafted → approved → failed`. |
| `draft_post` | Run *this* repo's Claude pipeline instead. Opt-in: `--allow-drafting`. |
| `publish_post` | Publish to the blog and LinkedIn. Opt-in: `--allow-publish`. |

The intended split is that the connected model does the writing and calls `create_post` —
you pay nothing to the Anthropic API for it, and the post lands in the git working tree as
Markdown for you to review as a diff. `draft_post` is there for when you want this repo's
research-and-fact-check pipeline to do the work instead.

### What's off by default

`publish_post` and `draft_post` are **not registered** unless you pass their flags. Publishing
is public and a LinkedIn post can't be deleted through the API, so a connected model cannot
reach the outside world until you opt in:

```bash
npm run mcp -- --allow-publish --allow-drafting
```

Even then, `publish_post` refuses any post that isn't `approved`, and refuses to post to
LinkedIn twice for the same post. Approval stays a human step.

### Connecting a local client

```json
{
  "mcpServers": {
    "blogwriter": {
      "command": "npx",
      "args": ["tsx", "src/cli.ts", "mcp"],
      "cwd": "/absolute/path/to/BlogWriter"
    }
  }
}
```

### Connecting a remote model over HTTP

Set a bearer token and the server requires it on every request:

```bash
MCP_AUTH_TOKEN="$(openssl rand -hex 32)" npm run mcp -- --http --host 0.0.0.0
```

Point the client at `http://<host>:8848/mcp` with `Authorization: Bearer <token>`. The server
**refuses to start on a non-loopback address without a token** — an open MCP endpoint gives
strangers write access to your content store. Requests run stateless (one server instance per
request), and `Host` headers are checked as DNS-rebinding protection. Put it behind TLS before
exposing it to the internet; the token is sent as a plain header.

### Automated workflows (GitHub Actions)

Three workflows run automatically:

| Workflow | Trigger | Action |
|---|---|---|
| `generate.yml` | Weekly (Thu 2pm UTC) | Draft a post from the backlog and open a PR |
| `publish.yml` | PR merge to `main` | Publish posts to website + LinkedIn |
| `token-health.yml` | Weekly (Mon 9am UTC) | Warn if LinkedIn token expires soon |

Customize cron schedules in `.github/workflows/`.

## How a draft is produced

```
research  →  draft  →  edit  →  verify  →  metadata
(web search   (xhigh   (revision  (fact-check   (title,
 + citations)  effort)  pass)      vs sources)   excerpt, tags)
```

The **verify** pass runs in a fresh context on purpose. Asking a model to re-check its own
reasoning inside the same conversation is measurably weaker than handing the finished text
to a caller that never saw it being written. Anything it can't tie to a source is written to
`unsupportedClaims` in the front matter and printed at the end of the run — it does not
block, it just makes sure you see it.

Every call shares one cached system prompt, so the voice guide is billed at ~10% on repeat
runs. The CLI prints a cost estimate at the end of each draft.

## Configuration

| File | Purpose |
|---|---|
| `config/profile.yml` | Who you are, who you write for, how you sound. **Start here.** |
| `config/topics.yml` | Idea backlog, themes, and angles to avoid. |
| `config/model.yml` | Model ID, per-stage effort, token ceilings. |
| `config/website.yml` | Blog API endpoint, auth, and base URL. |
| `config/linkedin.yml` | LinkedIn API version, visibility, and token env vars. |

## Validation

```bash
npm run validate            # Check config + stored posts (no API calls)
```

## Development

```bash
npm run typecheck
npm test
```

Tests cover:
- Slug generation against the blog API's `^[a-z0-9][a-z0-9-]{0,100}$` constraint
- Front-matter round-tripping (YAML ↔ Markdown)
- Status transition rules (idea → drafted → approved → published)
- No network calls — all tests are local
