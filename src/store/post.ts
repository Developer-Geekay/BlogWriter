import { z } from 'zod';

/**
 * The lifecycle of a post. Transitions are enforced by `assertTransition` so a
 * post can never jump straight from `drafted` to `published` without passing
 * through the review gate.
 */
export const POST_STATUSES = ['idea', 'drafted', 'approved', 'published', 'failed'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  idea: ['drafted', 'failed'],
  drafted: ['drafted', 'approved', 'failed'], // re-drafting in place is allowed
  approved: ['published', 'failed', 'drafted'], // back to drafted if you request changes
  published: [], // terminal — a published post is edited by drafting a new revision
  failed: ['drafted', 'idea'],
};

export class InvalidTransitionError extends Error {
  constructor(from: PostStatus, to: PostStatus) {
    super(`Cannot move a post from "${from}" to "${to}"`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PostStatus, to: PostStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/**
 * YAML parses unquoted date-like scalars (`2026-07-29`, ISO timestamps) into
 * JavaScript `Date` objects. Since these files are meant to be hand-edited
 * during review, we accept both and normalise to a string rather than
 * rejecting a perfectly reasonable edit.
 */
const coerceDateTime = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

/** Required timestamp — coerced, but must be present. */
const isoDateTimeRequired = () => z.preprocess(coerceDateTime, z.string());

const isoDateTime = (fallback = '') =>
  z.preprocess(coerceDateTime, z.string()).default(fallback);

/** Same, but normalised to `YYYY-MM-DD` for the blog API's `date` field. */
const isoDate = (fallback = '') =>
  z.preprocess(
    (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
    z.string(),
  ).default(fallback);

export const SourceSchema = z.object({
  url: z.string(),
  title: z.string().default(''),
  accessedAt: isoDateTime(),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Per-target publish state. Kept separate per target because the two have
 * different retry semantics: the blog API is an upsert (safe to retry), while
 * LinkedIn is not (a second call creates a second post), so `postUrn` acts as
 * the double-post guard.
 */
export const WebsiteStateSchema = z.object({
  status: z.enum(['pending', 'draft', 'published', 'failed']).default('pending'),
  url: z.string().nullable().default(null),
  publishedAt: z.preprocess((v) => (v instanceof Date ? v.toISOString() : v), z.string().nullable()).default(null),
  error: z.string().nullable().default(null),
});

export const LinkedInStateSchema = z.object({
  text: z.string().default(''),
  status: z.enum(['pending', 'published', 'failed', 'skipped']).default('pending'),
  postUrn: z.string().nullable().default(null),
  commentUrn: z.string().nullable().default(null),
  publishedAt: z.preprocess((v) => (v instanceof Date ? v.toISOString() : v), z.string().nullable()).default(null),
  error: z.string().nullable().default(null),
});

export const FrontmatterSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().default(''),
  status: z.enum(POST_STATUSES).default('drafted'),
  createdAt: isoDateTimeRequired(),
  updatedAt: isoDateTime(),
  /** Maps to the blog API's `date` field. `YYYY-MM-DD`. */
  publishDate: isoDate(),
  tags: z.array(z.string()).default([]),
  topic: z.string().default(''),
  sources: z.array(SourceSchema).default([]),
  /** Claims the fact-check pass could not tie to a source. Reviewed in the PR. */
  unsupportedClaims: z.array(z.string()).default([]),
  website: WebsiteStateSchema.prefault({}),
  linkedin: LinkedInStateSchema.prefault({}),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export interface Post {
  frontmatter: Frontmatter;
  /** Markdown body, sent verbatim as the API's `content` field. */
  body: string;
}

/** Public URL a post will live at once published. */
export function postUrl(siteBaseUrl: string, slug: string, blogPath = '/blog'): string {
  const base = siteBaseUrl.replace(/\/+$/, '');
  const path = `/${blogPath.replace(/^\/+|\/+$/g, '')}`;
  return `${base}${path}/${slug}`;
}
