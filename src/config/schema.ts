import { z } from 'zod';

export const ProfileSchema = z.object({
  author: z.object({
    name: z.string(),
    site: z.string().default('https://gokulakannan.dev'),
    linkedin: z.string().default(''),
  }),
  audience: z.string(),
  /**
   * The voice guide. This is the highest-leverage input in the whole system —
   * it is injected into every drafting call and sits behind the prompt-cache
   * breakpoint, so making it long and specific costs almost nothing on repeat
   * runs.
   */
  voice: z.object({
    description: z.string(),
    do: z.array(z.string()).default([]),
    dont: z.array(z.string()).default([]),
    samples: z.array(z.string()).default([]),
  }),
  bannedPhrases: z.array(z.string()).default([]),
  post: z.object({
    minWords: z.number().int().positive().default(800),
    maxWords: z.number().int().positive().default(1600),
    defaultTags: z.array(z.string()).default([]),
  }),
  linkedin: z.object({
    maxChars: z.number().int().positive().default(1300),
    linkInFirstComment: z.boolean().default(true),
    maxHashtags: z.number().int().min(0).default(3),
  }),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const TopicsSchema = z.object({
  themes: z.array(z.string()).default([]),
  backlog: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
});
export type Topics = z.infer<typeof TopicsSchema>;

export const WebsiteConfigSchema = z.object({
  baseUrl: z.string().default('https://gokulakannan.dev'),
  postsPath: z.string().default('/api/posts'),
  /** Public post URL is derived as `${baseUrl}${blogPath}/${slug}`. */
  blogPath: z.string().default('/blog'),
  tokenEnv: z.string().default('WEBSITE_API_TOKEN'),
});
export type WebsiteConfig = z.infer<typeof WebsiteConfigSchema>;

export const ModelConfigSchema = z.object({
  id: z.string().default('claude-opus-5'),
  /**
   * Per-stage effort. Research and editing benefit from deliberation; the
   * short LinkedIn rewrite does not.
   */
  effort: z
    .object({
      research: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
      draft: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('xhigh'),
      edit: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
      verify: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
      metadata: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
      repurpose: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
    })
    .prefault({}),
  maxTokens: z.number().int().positive().default(32000),
  maxSearches: z.number().int().min(0).default(8),
  /**
   * Server-side refusal fallback. Claude Opus 5 runs safety classifiers that
   * can decline a request outright; with this on, the API re-runs it on a
   * fallback model in the same call instead of returning nothing. Harmless to
   * leave on — if the beta is not enabled for your account, the client detects
   * the rejection and retries once without it.
   */
  refusalFallback: z.boolean().default(true),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const AppConfigSchema = z.object({
  profile: ProfileSchema,
  topics: TopicsSchema,
  website: WebsiteConfigSchema,
  model: ModelConfigSchema,
  contentDir: z.string().default('content/posts'),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
