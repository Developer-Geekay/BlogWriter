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
