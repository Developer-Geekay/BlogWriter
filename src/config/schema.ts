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

export const LinkedInConfigSchema = z.object({
  /**
   * LinkedIn versions its API by month and supports each for about a year.
   * A `426 Upgrade Required` response means this value is too old — bump it.
   */
  apiVersion: z.string().default('202606'),
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),
  tokenEnv: z.string().default('LINKEDIN_ACCESS_TOKEN'),
  personUrnEnv: z.string().default('LINKEDIN_PERSON_URN'),
  /** Warn this many days before the access token expires. */
  expiryWarningDays: z.number().int().positive().default(7),
});
export type LinkedInConfig = z.infer<typeof LinkedInConfigSchema>;

export const AppConfigSchema = z.object({
  profile: ProfileSchema,
  topics: TopicsSchema,
  website: WebsiteConfigSchema,
  linkedin: LinkedInConfigSchema,
  contentDir: z.string().default('content/posts'),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
