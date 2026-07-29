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
| Website publishing | Custom backend API (adapter written against your spec) |
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
slug: rag-chunking-tradeoffs
title: "..."
status: drafted          # idea → drafted → approved → published | failed
createdAt: 2026-07-29T...
tags: [rag, retrieval]
sources:                 # every factual claim traces to one of these
  - { url: "...", title: "...", accessedAt: "..." }
linkedin:
  text: "..."            # the repurposed short-form variant
  status: pending
  postUrn: null
website:
  status: pending
  url: null
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

## Website integration

`src/publishers/website.ts` is a **config-driven HTTP adapter** — endpoint, method, auth
header, and a field mapping from post front matter to your payload shape, all declared in
`config/website.yml`. That means wiring up your backend is a config edit, not a code change.

```yaml
# config/website.yml — illustrative until I have your spec
baseUrl: https://api.yoursite.com
auth: { type: bearer, tokenEnv: WEBSITE_API_TOKEN }
create:
  method: POST
  path: /posts
  body:
    title:   "{{title}}"
    slug:    "{{slug}}"
    content: "{{bodyHtml}}"
    tags:    "{{tags}}"
  responseUrlPath: data.url    # where to read the published URL from
```

**This is the one blocking unknown** — see Open Questions. Until you give me the spec,
`--dry-run` (the default) logs the exact HTTP request it would send, so everything else can
be built and tested end-to-end without it.

---

## Safety rails

- **Dry-run is the default.** Publishing requires an explicit `--live` flag, which only the
  publish workflow passes.
- **Idempotency.** A post publishes only from `status: approved`, and the adapter writes the
  returned URN/URL back before marking `published`. Reruns are no-ops.
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
| **3. LinkedIn** | `linkedin:auth` CLI, Posts API adapter, image upload, token-health workflow. | Your LinkedIn app + product approval |
| **4. Website** | Config-driven adapter against your real API. | **Your API spec** |
| **5. Publish + polish** | `publish.yml` on merge, status write-back, failure→issue reporting, `status` command. | Phases 3–4 |

Phases 1–2 give you a working "AI drafts a post, I review it in a PR" loop with no external
dependencies. Everything after that is publishing plumbing.

---

## Verification

- **Unit:** front-matter round-trip, status transitions, website payload mapping, LinkedIn
  request builder (asserted against recorded fixtures — no live calls in tests).
- **Integration, dry-run:** `cli draft --topic "..."` → inspect the generated Markdown;
  `cli publish --dry-run` → inspect the logged HTTP requests for both targets.
- **Integration, live:** first LinkedIn post published with `visibility: CONNECTIONS` as a
  smoke test before switching to `PUBLIC`. First website post to a staging/draft state if
  your API supports one.
- **End-to-end:** trigger `generate.yml` manually via `workflow_dispatch` → confirm a PR
  appears with a complete draft → merge → confirm the post is live on both surfaces and the
  front matter now carries both URLs.

---

## Open questions

1. **Website API spec** — endpoint, auth method, and the JSON shape for creating a post.
   Also: does it accept Markdown or HTML, and does it have a draft/unpublished state?
   *(Blocks phase 4 only.)*
2. **Niche and cadence** — what do you write about, and how often should the cron run?
   I'd suggest weekly to start; daily AI content on a personal brand tends to read as spam.
3. **Voice samples** — 2–3 things you've written that sound like you. This is the single
   highest-leverage input for output quality; without it the drafts will read generic.
4. **Cover images** — Playwright-rendered branded title card, or skip images in v1?
5. **Cross-linking** — should the LinkedIn post link to the blog post? (LinkedIn suppresses
   reach on posts with external links; the usual workaround is putting the link in the first
   comment, which I can automate.)
