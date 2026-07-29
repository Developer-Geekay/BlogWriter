# BlogWriter

AI-assisted content pipeline for [gokulakannan.dev](https://gokulakannan.dev) and LinkedIn.
Claude researches, drafts, edits, and fact-checks a post; you review it; it publishes.

Full design in [`docs/PLAN.md`](docs/PLAN.md). **Phase 1 (local drafting) is implemented.**
Publishing to the website and LinkedIn comes in later phases — nothing in this repo can
post anything publicly yet.

## Setup

```bash
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
```

Then fill in `config/profile.yml`. The `voice.samples` field is the single biggest lever on
output quality — paste in two or three things you've actually written. Without them the
drafts will be competent and generic.

## Usage

```bash
npm run draft -- --topic "Why retrieval quality beats context window size"
npm run status              # every post and where it stands
npm run validate            # check config + stored posts, no API calls
```

Useful flags:

| Flag | Effect |
|---|---|
| `--no-research` | Skip web search. Cheaper and faster; use for opinion pieces. |
| `--slug <slug>` | Override the generated slug. |
| `-q, --quiet` | Suppress progress output. |

Drafts land in `content/posts/<slug>.md` as Markdown with YAML front matter. Edit them by
hand freely — the store tolerates hand-editing, including unquoted dates.

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
| `config/website.yml` | Blog API endpoint and auth. Unused until phase 3. |

## Development

```bash
npm run typecheck
npm test
```

Tests cover slug generation against the blog API's `^[a-z0-9][a-z0-9-]{0,100}$` constraint,
front-matter round-tripping, and status-transition rules. They make no network calls.
