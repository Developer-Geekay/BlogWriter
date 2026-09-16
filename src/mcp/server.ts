import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PostNotFoundError, SlugTakenError, type PostReadWrite } from '../db/posts.js';
import { POST_KINDS, POST_MATURITIES, POST_STATUSES, type Post } from '../db/types.js';
import { InvalidSlugError } from '../store/slug.js';
import type { Profile, Topics } from '../config/schema.js';

export const MCP_SERVER_NAME = 'blog';
export const MCP_SERVER_VERSION = '1.0.0';

/**
 * Read-only slices of the analytics and media stores.
 *
 * Declared here as narrow interfaces rather than importing the concrete stores,
 * for the same reason `PostReadWrite` exists: the tool layer is testable
 * against a fake, and a connected model gets no way to write to either. Reads
 * are the whole point — a model should be able to see what performs and what
 * images exist, and should not be able to delete an object or forge a visit.
 */
export interface AnalyticsReadonly {
  totals(days: number): Promise<{ reads: number; finishes: number; finishRate: number | null }>;
  topPosts(days: number, limit?: number): Promise<{ slug: string; reads: number }[]>;
  sources(days: number): Promise<Record<string, number>>;
}

export interface MediaReadonly {
  list(limit?: number): Promise<{ key: string; size: number; lastModified: string | null }[]>;
}

export interface McpServerOptions {
  posts: PostReadWrite;
  /** Voice guide for connected writers. Optional — the tool is skipped without it. */
  profile?: Profile;
  topics?: Topics;
  /**
   * Allow the irreversible operations: publishing a post to the public site and
   * deleting one. Off unless the operator turns it on in the portal settings.
   */
  allowPublish?: boolean;
  /** Public base URL, so the model can report where a post will appear. */
  siteUrl?: string;
  /** Read counts. Absent when nothing has been recorded or the store is down. */
  analytics?: AnalyticsReadonly;
  /** Uploaded images. Absent when object storage is not configured. */
  media?: MediaReadonly;
}

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function json(value: unknown): CallToolResult {
  return text(JSON.stringify(value, null, 2));
}

/** Errors go back in-band so the calling model can read and correct them. */
function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function summarise(post: Post, siteUrl?: string) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    status: post.status,
    kind: post.kind,
    maturity: post.maturity,
    tags: post.tags,
    readingTime: post.readingTime,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    unsupportedClaims: post.unsupportedClaims,
    ...(siteUrl && post.status === 'published'
      ? { url: `${siteUrl.replace(/\/+$/, '')}/entry/${post.slug}` }
      : {}),
  };
}

export function buildMcpServer(options: McpServerOptions): McpServer {
  const { posts, profile, topics, allowPublish = false, siteUrl, analytics, media } = options;

  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions: [
        'Authoring tools for a personal blog.',
        '',
        profile
          ? 'Call `get_voice_guide` before writing and match the voice it describes — a post that does not sound like the author gets rejected.'
          : '',
        'Write the post yourself and save it with `create_post`. Posts are created as',
        'drafts and are not visible on the public site until published.',
        '',
        'Before writing, call `list_topics` and reuse an existing tag rather than',
        'coining a near-duplicate — the public topic map is built from these, and',
        '"k8s" alongside "kubernetes" splits one topic into two.',
        analytics
          ? 'Call `get_analytics` when deciding what to write about; it reports which entries are actually read.'
          : '',
        media
          ? 'Cover images must already exist in storage. Use `list_media` and pass one of its URLs — a made-up URL renders as a broken image.'
          : '',
        allowPublish
          ? 'You may publish, which puts a post on the public internet. Confirm with the user first.'
          : 'You cannot publish or delete; a human does that in the portal.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  );

  if (profile) {
    server.registerTool(
      'get_voice_guide',
      {
        title: 'Get voice guide',
        description:
          "The author's voice, audience, banned phrases, and length targets. Read this " +
          'before writing — it is what makes a draft usable rather than generic.',
        // No inputSchema on purpose: a client may omit `arguments` entirely for a
        // tool that takes none, and a declared schema would reject that.
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () =>
        json({
          author: profile.author,
          audience: profile.audience,
          voice: profile.voice,
          bannedPhrases: profile.bannedPhrases,
          lengthTarget: { minWords: profile.post.minWords, maxWords: profile.post.maxWords },
          defaultTags: profile.post.defaultTags,
          ...(topics ? { topics } : {}),
        }),
    );
  }

  server.registerTool(
    'list_posts',
    {
      title: 'List posts',
      description:
        'Posts in the blog, newest first. Use it to avoid duplicating a topic that exists.',
      inputSchema: {
        status: z
          .enum(POST_STATUSES)
          .optional()
          .describe('Filter by state. Pass {} for all of them.'),
        search: z
          .string()
          .optional()
          .describe('Matches title, excerpt, tags and the full body text.'),
        tag: z.string().optional().describe('Only entries filed under this tag.'),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, search, tag, limit }) => {
      const found = await posts.list({
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
        ...(tag ? { tag } : {}),
        limit,
      });
      return json({ count: found.length, posts: found.map((p) => summarise(p, siteUrl)) });
    },
  );

  server.registerTool(
    'list_topics',
    {
      title: 'List topics',
      description:
        'Every tag in use on published entries, with how many carry it. Read this before ' +
        'tagging a new post and reuse what is here — the public topic map is built from ' +
        'these, so a near-duplicate splits one topic into two.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const tags = await posts.tags();
      return json({ count: tags.length, topics: tags });
    },
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get post',
      description: 'Full Markdown body and metadata for one post, by slug or id.',
      inputSchema: {
        slug: z.string().optional().describe('The post slug.'),
        id: z.string().optional().describe('The post id, if you have it instead.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ slug, id }) => {
      if (!slug && !id) return failure('Pass either a slug or an id.');
      const post = slug ? await posts.findBySlug(slug) : await posts.findById(id!);
      if (!post) return failure(`No post matching ${slug ?? id}.`);
      return json({ ...summarise(post, siteUrl), body: post.body, sources: post.sources });
    },
  );

  server.registerTool(
    'create_post',
    {
      title: 'Create post',
      description:
        'Save a post you have written. It is created as a draft — invisible to the public ' +
        'until a human publishes it. Body is Markdown without an H1; the title is separate.',
      inputSchema: {
        title: z.string().min(1).describe("Post title, in the author's voice."),
        body: z.string().min(1).describe('Markdown body. No H1 — the title is separate.'),
        excerpt: z.string().default('').describe('One or two sentences for previews.'),
        tags: z.array(z.string()).default([]),
        kind: z
          .enum(POST_KINDS)
          .default('notes')
          .describe(
            'What sort of piece this is. "til" for a single short finding, "deep-dive" for ' +
              'a long treatment of one problem, "walkthrough" for annotated code, "essay" ' +
              'for an argument, "links" for a roundup, "series" for one part of several. ' +
              'Leave as "notes" if none of them fits.',
          ),
        maturity: z
          .enum(POST_MATURITIES)
          .default('seed')
          .describe(
            'How finished the thinking is, which is not the same as whether it is published. ' +
              '"seed" is rough and still moving, "growing" is usable but incomplete, ' +
              '"evergreen" is settled. Default to "seed" — the author raises it, not you.',
          ),
        slug: z.string().optional().describe('Override the slug derived from the title.'),
        coverImage: z.string().nullable().default(null).describe('Absolute image URL.'),
        sources: z
          .array(z.object({ url: z.string(), title: z.string().default('') }))
          .default([])
          .describe('Sources backing any factual claim, so a reviewer can check them.'),
        unsupportedClaims: z
          .array(z.string())
          .default([])
          .describe(
            'Claims you could not source. Be honest — flagged claims get checked, ' +
              'silent ones get published wrong.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const post = await posts.create({ ...input, status: 'draft' });
        const notes = [`Created draft "${post.title}" (slug "${post.slug}", id ${post.id}).`];

        if (profile) {
          const words = input.body.split(/\s+/).filter(Boolean).length;
          const { minWords, maxWords } = profile.post;
          if (words < minWords || words > maxWords) {
            notes.push(
              `Length is ${words} words against a ${minWords}–${maxWords} target. ` +
                'Consider revising with update_post.',
            );
          }
          const hits = profile.bannedPhrases.filter((phrase) =>
            input.body.toLowerCase().includes(phrase.toLowerCase()),
          );
          if (hits.length) notes.push(`Contains banned phrases: ${hits.join(', ')}.`);
        }

        notes.push('It is not public yet.');
        return text(notes.join('\n'));
      } catch (err) {
        if (err instanceof InvalidSlugError) return failure(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    'update_post',
    {
      title: 'Update post',
      description: 'Revise a stored post. Only the fields you pass change.',
      inputSchema: {
        id: z.string().describe('The post id from create_post or list_posts.'),
        title: z.string().optional(),
        body: z.string().optional().describe('Replaces the whole Markdown body.'),
        excerpt: z.string().optional(),
        tags: z.array(z.string()).optional(),
        kind: z.enum(POST_KINDS).optional(),
        maturity: z.enum(POST_MATURITIES).optional(),
        coverImage: z.string().nullable().optional(),
        // Revising a post is the moment a claim usually gets sourced, so the
        // update path accepts sources too. Replaces the whole list, matching
        // how `body` and `tags` behave here.
        sources: z
          .array(z.object({ url: z.string(), title: z.string().default('') }))
          .optional()
          .describe('Replaces the whole source list.'),
        unsupportedClaims: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id, ...patch }) => {
      const changed = Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);
      if (changed.length === 0) return failure('Pass at least one field to change.');

      try {
        const post = await posts.update(id, patch);
        return text(
          `Updated ${changed.join(', ')} on "${post.slug}". ` +
            `Now ${post.readingTime} min read, status ${post.status}.`,
        );
      } catch (err) {
        if (err instanceof PostNotFoundError) return failure(err.message);
        if (err instanceof SlugTakenError || err instanceof InvalidSlugError) {
          return failure(err.message);
        }
        throw err;
      }
    },
  );

  if (analytics) {
    server.registerTool(
      'get_analytics',
      {
        title: 'Get read analytics',
        description:
          'How entries are actually performing: total reads, how many readers reached the ' +
          'end, the most-read entries, and where readers came from. Use it to decide what ' +
          'to write more of, and to tell the author what is working rather than guessing.',
        inputSchema: {
          days: z
            .number()
            .int()
            .min(1)
            .max(365)
            .default(30)
            .describe('Size of the window, counting back from today.'),
          limit: z.number().int().min(1).max(20).default(5).describe('How many top entries.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ days, limit }) => {
        const [totals, top, sources] = await Promise.all([
          analytics.totals(days),
          analytics.topPosts(days, limit),
          analytics.sources(days),
        ]);

        // Titles, not just slugs — a model reporting back to the author should
        // be able to name the entry rather than read out a URL fragment.
        const titled = await Promise.all(
          top.map(async (row) => ({
            ...row,
            title: (await posts.findBySlug(row.slug))?.title ?? row.slug,
          })),
        );

        return json({
          windowDays: days,
          reads: totals.reads,
          finishes: totals.finishes,
          // Null rather than 0 when nothing has been read: "nobody finishes
          // anything" and "nobody has read anything yet" are different facts.
          finishRatePercent: totals.finishRate,
          topEntries: titled,
          sources,
          note:
            totals.reads === 0
              ? 'No reads recorded in this window. Counting starts when someone opens a published entry.'
              : undefined,
        });
      },
    );
  }

  if (media) {
    server.registerTool(
      'list_media',
      {
        title: 'List media',
        description:
          'Images already uploaded to the blog, with the URL each one is served at. Pass one ' +
          'of these URLs as `coverImage` — you cannot upload, and a URL you invent will render ' +
          'as a broken image.',
        inputSchema: {
          limit: z.number().int().min(1).max(100).default(50),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ limit }) => {
        try {
          const objects = await media.list(limit);
          return json({
            count: objects.length,
            media: objects.map((object) => ({
              ...object,
              // The path the site serves it at. Absolute when a site URL is
              // configured, so the value can be pasted straight into coverImage.
              url: siteUrl
                ? `${siteUrl.replace(/\/+$/, '')}/api/media/${object.key}`
                : `/api/media/${object.key}`,
            })),
          });
        } catch (err) {
          // Object storage is a second backend and can be down while the
          // database is fine. Say so in-band rather than failing the call.
          return failure(`Could not reach object storage: ${(err as Error).message}`);
        }
      },
    );
  }

  if (allowPublish) {
    server.registerTool(
      'set_post_status',
      {
        title: 'Publish or unpublish a post',
        description:
          'Change whether a post is visible on the public site. "published" puts it on the ' +
          'public internet — confirm with the user before calling it. "draft" takes it back ' +
          'down, "archived" hides it without deleting.',
        inputSchema: {
          id: z.string(),
          status: z.enum(POST_STATUSES),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
      async ({ id, status }) => {
        try {
          const post = await posts.update(id, { status });
          return text(
            `"${post.slug}" is now ${post.status}.` +
              (post.status === 'published' && siteUrl
                ? ` Live at ${siteUrl.replace(/\/+$/, '')}/entry/${post.slug}`
                : ''),
          );
        } catch (err) {
          if (err instanceof PostNotFoundError) return failure(err.message);
          throw err;
        }
      },
    );

    server.registerTool(
      'delete_post',
      {
        title: 'Delete post',
        description: 'Permanently delete a post. There is no undo — prefer archiving.',
        inputSchema: { id: z.string() },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
      async ({ id }) => {
        try {
          await posts.delete(id);
          return text(`Deleted post ${id}.`);
        } catch (err) {
          if (err instanceof PostNotFoundError) return failure(err.message);
          throw err;
        }
      },
    );
  }

  return server;
}
