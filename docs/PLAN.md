# BlogWriter — AI Content Automation Plan

**Status:** draft for review · **Branch:** `claude/ai-blog-automation-plan-2bj99y`

## Context

Personal automation for writing blog posts and social posts with AI, then publishing them
to your own website and LinkedIn. Phase 1 scope is **your website + LinkedIn personal
profile**. The repo is currently empty (README, LICENSE, `.gitignore`), so this is a
greenfield build.

Decisions locked in:

| Decision | Choice |
|---|---|
| Website publishing | `gokulakannan.dev` Blog Posts API (Next.js + MongoDB) — spec received |
| LinkedIn target | Personal profile (`w_member_social`) |
| Human review | Review gate — nothing publishes without your approval |
| Stack / runtime | TypeScript + GitHub Actions cron (no server to maintain) |

Design goals, in priority order: **nothing embarrassing goes public without you seeing it**,
no fabricated facts, no double-posting, and no server to babysit.

---

## Architecture

```
                       ┌──────────────── GitHub Actions (cron) ────────────────┐
                       │                                                       │
  topics.yml ──▶ ideate ──▶ research ──▶ draft ──▶ self-edit ──▶ repurpose     │
   (your        (Claude)   (web search  (Claude)   (Claude      (LinkedIn      │
    backlog)                + citations)            critic)      variant)      │
                       │                                                       │
                       └───────────────────────┬───────────────────────────────┘
                                               │  writes content/posts/*.md
                                               ▼
                                    ┌──────────────────────┐
                                    │  Pull Request  ◀───── │  ← THE REVIEW GATE
                                    │  (you read + edit)   │
                                    └──────────┬───────────┘
                                               │ merge to main = approval
                                               ▼
                       ┌──────────── publish workflow (on merge) ──────────────┐
                       │   website adapter  ·  LinkedIn adapter                │
                       └───────────────────┬───────────────────────────────────┘
                                           ▼
                            content/posts/*.md updated with
                            status: published, urls, timestamps
```

### Why a PR is the review queue

No database, no dashboard, no hosting. The PR gives you the full draft with diff view,
inline editing, comment-to-revise, and a permanent audit trail of what was published and
when. Merging is the approval signal. If you hate a draft, close the PR — nothing happens.

### Content store

Git is the database. Every post is one Markdown file with YAML front matter:

```yaml
---
id: 01JCXY...            # ULID, idempotency key — prevents double-posting
slug: rag-chunking-tradeoffs   # validated against the API's ^[a-z0-9][a-z0-9-]{0,100}$
title: "..."
excerpt: "..."           # generated; maps to the API's excerpt field
status: drafted          # idea → drafted → approved → published | failed
createdAt: 2026-07-29T...
publishDate: 2026-07-29  # maps to the API's date field
tags: [rag, retrieval]
sources:                 # every factual claim traces to one of these
  - { url: "...", title: "...", accessedAt: "..." }
linkedin:
  text: "..."            # the repurposed short-form variant
  status: pending
  postUrn: null          # set once posted — the double-post guard
website:
  status: pending        # pending → draft → published
  url: null              # https://gokulakannan.dev/blog/{slug}
---

<post body in Markdown>
```

Status transitions are the state machine; the front matter is the single source of truth
for "did this already publish?" — which is what makes reruns safe.

---

## Repository layout

```
.github/workflows/
  generate.yml           # cron → drafts → opens PR
  publish.yml            # on merge to main → publishes approved posts
  token-health.yml       # weekly LinkedIn token expiry warning
config/
  profile.yml            # your voice, audience, niche, banned phrases
  topics.yml             # idea backlog + themes to mine
  website.yml            # your API endpoint/auth/payload mapping
content/
  posts/*.md             # the content store
  ideas.yml              # generated ideas awaiting promotion to draft
src/
  cli.ts                 # commands: ideate | draft | publish | linkedin:auth | status
  config/                # zod-validated config + env loading
  llm/client.ts          # Anthropic SDK wrapper (model, thinking, caching, retries)
  pipeline/
    ideate.ts  research.ts  draft.ts  edit.ts  repurpose.ts  assets.ts
  publishers/
    types.ts             # Publisher interface — the seam
    website.ts           # config-driven HTTP adapter
    linkedin.ts          # LinkedIn Posts API + image upload
    dryRun.ts            # writes to disk, logs the request it *would* have sent
  store/                 # front-matter read/write, slugs, status transitions
docs/PLAN.md             # this file
```

---

## Pipeline stages

| Stage | What it does | Model config |
|---|---|---|
| **ideate** | Mines `topics.yml` + recent posts for non-duplicate angles; writes to `content/ideas.yml` | `effort: medium` |
| **research** | Server-side `web_search_20260209` tool with citations; collects sources into front matter | `effort: high` |
| **draft** | Long-form post in your voice from `profile.yml` + the researched sources | `effort: xhigh`, streaming |
| **edit** | Separate critic pass: fact-check every claim against `sources`, flag unsupported ones, tighten prose | fresh context, `effort: high` |
| **repurpose** | LinkedIn variant — hook-first, ~1300 chars, no hashtag soup, links in first comment | `effort: medium` |
| **assets** | Branded cover image rendered from an HTML template via Playwright → PNG | no LLM |

Notes on two of these:

- **Fact-checking is a separate pass with a fresh context**, not a "please double-check
  yourself" instruction appended to the drafting prompt. Self-check in the same context is
  measurably weaker, and on current models over-verification instructions backfire.
- **Images:** Claude can't generate images. Playwright + Chromium are already available in
  this environment, so the cheapest good-looking option is rendering a branded title card
  from an HTML template. Alternative: skip images entirely in v1.

Cost control: the system prompt (voice guide + examples) is stable across every call, so it
sits behind a prompt-cache breakpoint — repeat runs bill that prefix at ~10%.

---

## LinkedIn integration

**App setup (one-time, manual — you do this in the LinkedIn Developer portal):**

1. Create an app, associate it with a LinkedIn Page you control (required even for
   personal-profile posting).
2. Request products: **Share on LinkedIn** + **Sign In with LinkedIn using OpenID Connect**.
   Both are self-serve — no LinkedIn review queue, unlike the Community Management API a
   company-page build would need.
3. Scopes: `openid`, `profile`, `w_member_social`.

**Auth flow:** `npm run cli linkedin:auth` spins a localhost callback, runs the 3-legged
OAuth dance once, calls `/v2/userinfo` to capture your person URN (`sub`), and prints the
tokens to paste into GitHub Secrets.

⚠️ **Known friction to plan around:** LinkedIn member access tokens last 60 days.
Programmatic refresh tokens are not granted to every app. So the design assumes the token
*will* expire and handles it gracefully: `token-health.yml` runs weekly and opens a GitHub
issue when the token is within 7 days of expiry, telling you to rerun `linkedin:auth`. If
your app does have refresh tokens, the adapter uses them automatically and the warning
never fires. Either way the pipeline never silently fails to post.

**Posting:** `POST https://api.linkedin.com/rest/posts` with `LinkedIn-Version` and
`X-Restli-Protocol-Version: 2.0.0` headers. With an image: initialize upload via
`/rest/images?action=initializeUpload`, PUT the binary to the returned URL, reference the
returned image URN in the post body. Response `x-restli-id` is the post URN, written back
to front matter so a rerun can never post twice.

---

## Website integration — `gokulakannan.dev`

`POST /api/posts` with `Authorization: Bearer $API_SECRET_KEY`. Three properties of this
API shape the design more than anything else:

**1. The `content` field takes Markdown.** No HTML conversion step, no Markdown-to-blocks
translation layer. Our content store is already Markdown + front matter, so publishing is
close to a straight field copy:

| Front matter | API field | Notes |
|---|---|---|
| `slug` | `slug` | must match `^[a-z0-9][a-z0-9-]{0,100}$` — validated locally before send |
| `title` | `title` | required |
| `publishDate` | `date` | `YYYY-MM-DD` |
| `tags` | `tags` | string array |
| `excerpt` | `excerpt` | generated by the draft stage |
| — | `published` | drives the review gate, below |
| body | `content` | Markdown, verbatim |

**2. `POST` is an upsert keyed by slug** (`findOneAndUpdate` with `upsert: true`), so writes
are idempotent and safe to retry. A failed publish can simply be re-run — no compensating
logic, no partial-write cleanup.

**3. There's a `published: false` draft state** — and this is the interesting one. It lets
the review gate work against the *real rendered site* instead of a raw Markdown diff:

```
PR opened   →  POST /api/posts  { published: false }   →  draft lives on your site
you review  →  read it at gokulakannan.dev/blog/{slug} with real styling
merge PR    →  PUT  /api/posts/{slug} { published: true }  →  live
close PR    →  DELETE /api/posts/{slug}                    →  cleaned up
```

Reviewing a post the way readers will actually see it beats reviewing Markdown in a diff
view. The PR still exists as the approval mechanism and audit trail; it just stops being
the *reading* surface.

⚠️ **One thing to verify before committing to this.** The spec documents draft behaviour for
the **API** (`GET /api/posts/{slug}` returns 404 for drafts unless authenticated), but not
for the **`/blog/{slug}` page**, which is statically generated. If that page renders drafts
for a logged-in admin session, the preview flow above works as drawn. If it 404s, we fall
back to reviewing the Markdown in the PR diff — everything else is unchanged. I'll check
this with a throwaway draft slug during phase 4 rather than assume it.

Since the API returns only `{ "slug": "..." }`, the public URL is derived as
`https://gokulakannan.dev/blog/{slug}` and written back to front matter. Revalidation of
`/blog` and `/blog/{slug}` is automatic server-side, so no cache-busting on our end.

The adapter stays config-driven (`config/website.yml` holds base URL, auth, and the field
map) so a local dev run against `http://localhost:3000` is a one-line change.

---

## Safety rails

- **Dry-run is the default.** Publishing requires an explicit `--live` flag, which only the
  publish workflow passes.
- **Idempotency.** The website API is an upsert, so retries there are inherently safe.
  LinkedIn is *not* — a second call creates a second post — so a post publishes only from
  `status: approved`, and `linkedin.postUrn` is written back before the status flips.
  A rerun with a non-null `postUrn` skips LinkedIn entirely.
- **Nothing publishes from a branch.** Publish only triggers on merge to `main`.
- **Unsupported-claim gate.** If the edit pass flags a claim with no matching source, the PR
  gets a checklist comment; you decide.
- **Secrets** live in GitHub Secrets, never in the repo: `ANTHROPIC_API_KEY`,
  `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`,
  `LINKEDIN_PERSON_URN`, `WEBSITE_API_TOKEN`.

---

## Build phases

| Phase | Deliverable | Blocked on |
|---|---|---|
| **1. Foundation** | TS scaffold, config schemas, Anthropic client, content store, `draft` command writing Markdown locally. Fully usable offline. | — |
| **2. Review gate** | `generate.yml` cron → drafts → opens a PR with the content. The loop is real from here. | — |
| **3. Website** | `gokulakannan.dev` adapter, slug validation, draft-preview flow (incl. the `/blog/{slug}` draft-rendering check). | `API_SECRET_KEY` |
| **4. LinkedIn** | `linkedin:auth` CLI, Posts API adapter, image upload, token-health workflow. | Your LinkedIn app + product approval |
| **5. Publish + polish** | `publish.yml` on merge, status write-back, failure→issue reporting, `status` command. | Phases 3–4 |

Website and LinkedIn swapped order from the previous draft: the website spec is in hand and
needs only an API key, while LinkedIn is gated on app creation and product approval that
you have to do by hand in their portal. No reason to let that block the first real
end-to-end publish.

Phases 1–2 give you a working "AI drafts a post, I review it in a PR" loop with no external
dependencies. Everything after that is publishing plumbing.

---

## Verification

- **Unit:** front-matter round-trip, status transitions, website payload mapping, LinkedIn
  request builder (asserted against recorded fixtures — no live calls in tests).
- **Integration, dry-run:** `cli draft --topic "..."` → inspect the generated Markdown;
  `cli publish --dry-run` → inspect the logged HTTP requests for both targets.
- **Integration, live:** website smoke test against `http://localhost:3000` first, then a
  throwaway slug on production with `published: false` — which also settles the
  draft-rendering question above — then `DELETE` to clean up. First LinkedIn post published
  with `visibility: CONNECTIONS` before switching to `PUBLIC`.
- **End-to-end:** trigger `generate.yml` manually via `workflow_dispatch` → confirm a PR
  appears with a complete draft → merge → confirm the post is live on both surfaces and the
  front matter now carries both URLs.

---

## Open questions

1. **Niche and cadence** — what do you write about, and how often should the cron run?
   I'd suggest weekly to start; daily AI content on a personal brand tends to read as spam.
2. **Voice samples** — 2–3 things you've written that sound like you. This is the single
   highest-leverage input for output quality; without it the drafts will read generic.
   If you already have posts live at `gokulakannan.dev/blog`, `GET /api/posts` gives me the
   list and I can pull the bodies myself — just say the word.
3. **Cover images** — Playwright-rendered branded title card, or skip images in v1?
4. **Cross-linking** — should the LinkedIn post link to the blog post? (LinkedIn suppresses
   reach on posts with external links; the usual workaround is putting the link in the first
   comment, which I can automate.)
