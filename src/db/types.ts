import { z } from 'zod';
import { DEFAULT_ACCENT_ID } from '../theme/accents.js';

export const POST_STATUSES = ['draft', 'published', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * What kind of piece this is. Shown as a chip on the entry and in the feed.
 *
 * Stored as slugs and rendered uppercase — "DEEP DIVE" is presentation, not
 * data. `notes` is the default because it is the least committal: a post filed
 * by an AI client that did not pick a kind should not claim to be a deep dive.
 */
export const POST_KINDS = [
  'deep-dive',
  'til',
  'walkthrough',
  'series',
  'essay',
  'links',
  'notes',
] as const;
export type PostKind = (typeof POST_KINDS)[number];

/**
 * How finished the piece is, as distinct from whether it is published.
 *
 * The two are orthogonal on purpose: a published post can still be a seed, and
 * saying so openly is the point of the taxonomy. Defaults to `seed` so nothing
 * claims to be settled by accident.
 */
export const POST_MATURITIES = ['seed', 'growing', 'evergreen'] as const;
export type PostMaturity = (typeof POST_MATURITIES)[number];

/** Uppercase display labels, derived so the two can never drift. */
export function kindLabel(kind: PostKind): string {
  return kind.replace(/-/g, ' ').toUpperCase();
}

export function maturityLabel(maturity: PostMaturity): string {
  return maturity.toUpperCase();
}

/**
 * The sequence number shown against an entry ("014").
 *
 * Derived from position in a newest-first list rather than stored: a stored
 * number needs collision handling, renumbering on delete, and a backfill for
 * every existing post. Position gives the same reading — oldest is 001 — for
 * none of that.
 */
export function entryNumber(indexInNewestFirstList: number, total: number): string {
  return String(Math.max(1, total - indexInNewestFirstList)).padStart(3, '0');
}

export const SourceSchema = z.object({
  url: z.string(),
  title: z.string().default(''),
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * A post as the application sees it. `_id` is serialised to a string at the
 * repository boundary so nothing above it has to know about BSON — React
 * server components cannot pass an ObjectId to the client.
 */
export const PostSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().default(''),
  body: z.string().default(''),
  coverImage: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  status: z.enum(POST_STATUSES).default('draft'),
  kind: z.enum(POST_KINDS).default('notes'),
  maturity: z.enum(POST_MATURITIES).default('seed'),
  /** Minutes, derived from the body on every write. */
  readingTime: z.number().int().min(1).default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable().default(null),
  sources: z.array(SourceSchema).default([]),
  /** Claims the fact-check pass could not tie to a source. Shown in the editor. */
  unsupportedClaims: z.array(z.string()).default([]),
  linkedin: z
    .object({
      status: z.enum(['pending', 'published', 'failed', 'skipped']).default('pending'),
      postUrn: z.string().nullable().default(null),
      publishedAt: z.string().nullable().default(null),
    })
    .prefault({}),
});
export type Post = z.infer<typeof PostSchema>;

/** Fields a client may set when creating a post. */
export const PostCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.'),
  body: z.string().default(''),
  excerpt: z.string().default(''),
  slug: z.string().optional(),
  coverImage: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  status: z.enum(POST_STATUSES).default('draft'),
  kind: z.enum(POST_KINDS).default('notes'),
  maturity: z.enum(POST_MATURITIES).default('seed'),
  sources: z.array(SourceSchema).default([]),
  unsupportedClaims: z.array(z.string()).default([]),
});
export type PostCreate = z.infer<typeof PostCreateSchema>;

/** Every field optional — a PATCH changes only what it sends. */
export const PostUpdateSchema = PostCreateSchema.partial();
export type PostUpdate = z.infer<typeof PostUpdateSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  passwordHash: z.string(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * Portal settings — a single document. Anything an operator can change at
 * runtime lives here rather than in an environment variable, because changing
 * it must not require a redeploy.
 */
export const SettingsSchema = z.object({
  siteTitle: z.string().default('Scratchpad'),
  siteDescription: z.string().default(''),
  /**
   * Shown as a byline beside the wordmark. The publication name says what this
   * is; the byline says whose it is, which the domain alone cannot do once the
   * title stops repeating the author's name. Empty hides it.
   */
  siteAuthor: z.string().default('Gokulakannan'),
  /**
   * The author's role, shown as a mono kicker under their name on the about
   * page. Separate from the byline because the byline has to stay short enough
   * for the header, and this does not.
   */
  siteRole: z.string().default(''),
  /**
   * Which accent the site wears. A key into the palette in
   * `src/theme/accents.ts`, not a hex — each entry carries hand-picked light
   * and dark variants, which a raw colour could not.
   */
  siteAccent: z.string().default(DEFAULT_ACCENT_ID),
  /**
   * Free prose for the about page. Blank hides the page's body and leaves just
   * the name and role, which is better than shipping placeholder copy.
   */
  siteBio: z.string().default(''),
  /**
   * Master switch for the MCP endpoint. When false, `/api/mcp` refuses every
   * request — this is the toggle that disconnects external AI portals without
   * taking the site down or rotating the token.
   */
  mcpEnabled: z.boolean().default(false),
  /** Bearer token external portals present. Null until first generated. */
  mcpToken: z.string().nullable().default(null),
  /** Let a connected client publish, not just draft. Off by default. */
  mcpAllowPublish: z.boolean().default(false),
  updatedAt: z.string().nullable().default(null),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Never send the token to a page that only needs to know whether one exists. */
export type PublicSettings = Omit<Settings, 'mcpToken'> & { hasMcpToken: boolean };

/** ~200 words per minute, floored at one minute. */
export function readingTimeMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
