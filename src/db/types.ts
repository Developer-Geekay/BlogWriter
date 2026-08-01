import { z } from 'zod';

export const POST_STATUSES = ['draft', 'published', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

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
  siteDescription: z.string().default('Working notes on AI systems, retrieval, and shipping software.'),
  /**
   * Shown as a byline beside the wordmark. The publication name says what this
   * is; the byline says whose it is, which the domain alone cannot do once the
   * title stops repeating the author's name. Empty hides it.
   */
  siteAuthor: z.string().default('Gokulakannan'),
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
