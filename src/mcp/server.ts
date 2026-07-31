import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PostNotFoundError, SlugTakenError, type PostReadWrite } from '../db/posts.js';
import { POST_STATUSES, type Post } from '../db/types.js';
import { InvalidSlugError } from '../store/slug.js';
import type { Profile, Topics } from '../config/schema.js';

export const MCP_SERVER_NAME = 'blog';
export const MCP_SERVER_VERSION = '1.0.0';

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
    tags: post.tags,
    readingTime: post.readingTime,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    unsupportedClaims: post.unsupportedClaims,
    ...(siteUrl && post.status === 'published'
      ? { url: `${siteUrl.replace(/\/+$/, '')}/blog/${post.slug}` }
      : {}),
  };
}

export function buildMcpServer(options: McpServerOptions): McpServer {
  const { posts, profile, topics, allowPublish = false, siteUrl } = options;

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
        search: z.string().optional().describe('Match against title, excerpt, and tags.'),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, search, limit }) => {
      const found = await posts.list({
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
        limit,
      });
      return json({ count: found.length, posts: found.map((p) => summarise(p, siteUrl)) });
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
        coverImage: z.string().nullable().optional(),
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
                ? ` Live at ${siteUrl.replace(/\/+$/, '')}/blog/${post.slug}`
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
