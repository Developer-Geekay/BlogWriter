import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AppConfig } from '../config/schema.js';
import { requireEnv } from '../config/load.js';
import { LlmClient, estimateCostUsd } from '../llm/client.js';
import { PostRepository, newFrontmatter } from '../store/repository.js';
import { assertTransition, postUrl, type Post } from '../store/post.js';
import { slugify, uniqueSlug } from '../store/slug.js';
import { draftPost } from '../pipeline/draft.js';
import { publishPost } from '../pipeline/publish.js';
import { WebsitePublisher } from '../publishers/website.js';
import { LinkedInPublisher } from '../publishers/linkedin.js';
import { Logger } from '../util/log.js';

export const MCP_SERVER_NAME = 'blogwriter';
export const MCP_SERVER_VERSION = '0.1.0';

export interface McpServerOptions {
  config: AppConfig;
  /**
   * Register the tools that reach the outside world (`publish_post`). Off by
   * default: an MCP server handed to a third-party client should not be able to
   * put a post on the public internet or on a LinkedIn profile until the owner
   * says so, and a LinkedIn post cannot be un-published.
   */
  allowPublish?: boolean;
  /**
   * Register `draft_post`, which spends money on the Anthropic API. Off by
   * default — a connected model is expected to write the post itself and hand
   * the prose to `create_post`.
   */
  allowDrafting?: boolean;
  repo?: PostRepository;
}

/** Tool results are plain text; structured data goes as pretty JSON. */
function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function json(value: unknown): CallToolResult {
  return text(JSON.stringify(value, null, 2));
}

/**
 * A tool failure is reported in-band (`isError`) rather than thrown, so the
 * calling model reads the reason and can correct itself instead of seeing an
 * opaque transport-level error.
 */
function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function summarise(post: Post, config: AppConfig) {
  const fm = post.frontmatter;
  return {
    slug: fm.slug,
    title: fm.title,
    status: fm.status,
    tags: fm.tags,
    words: post.body.split(/\s+/).filter(Boolean).length,
    createdAt: fm.createdAt,
    unsupportedClaims: fm.unsupportedClaims,
    website: { status: fm.website.status, url: fm.website.url },
    linkedin: { status: fm.linkedin.status, postUrn: fm.linkedin.postUrn },
    willPublishTo: postUrl(config.website.baseUrl, fm.slug, config.website.blogPath),
  };
}

export function buildMcpServer(options: McpServerOptions): McpServer {
  const { config, allowPublish = false, allowDrafting = false } = options;
  const repo = options.repo ?? new PostRepository(config.contentDir);

  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions: [
        'Content pipeline for the gokulakannan.dev blog and its author\'s LinkedIn profile.',
        '',
        'Write a post yourself and save it with `create_post` — call `get_voice_guide`',
        'first and match the voice it describes, because a post that does not sound like',
        'the author is the one thing a human reviewer will always reject.',
        '',
        'Posts move idea -> drafted -> approved -> published. You can draft and revise',
        'freely; a human approves. Everything you write lands in a git working tree as',
        'Markdown, so nothing you do here is visible to the public until someone reviews',
        'the diff and publishes it.',
      ].join('\n'),
    },
  );

  // ---------------------------------------------------------------- read side

  server.registerTool(
    'get_voice_guide',
    {
      title: 'Get voice guide',
      description:
        'The author\'s voice, audience, banned phrases, length targets, and topic backlog. ' +
        'Read this before writing anything — it is what makes a draft usable rather than generic.',
      // Deliberately no `inputSchema`: the SDK validates `params.arguments`
      // against the schema whenever one is present, and a spec-compliant client
      // may omit `arguments` entirely on a tool that takes none — which would
      // then fail as "expected object, received undefined".
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const { profile, topics } = config;
      return json({
        author: profile.author,
        audience: profile.audience,
        voice: profile.voice,
        bannedPhrases: profile.bannedPhrases,
        post: profile.post,
        linkedin: {
          maxChars: profile.linkedin.maxChars,
          maxHashtags: profile.linkedin.maxHashtags,
          linkInFirstComment: profile.linkedin.linkInFirstComment,
        },
        topics,
      });
    },
  );

  server.registerTool(
    'list_posts',
    {
      title: 'List posts',
      description:
        'Every post in the content store with its status and publish state. ' +
        'Use it to avoid re-covering a topic that already exists.',
      inputSchema: {
        status: z
          .enum(['idea', 'drafted', 'approved', 'published', 'failed'])
          .optional()
          .describe('Only return posts in this state. Pass {} for all of them.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status }) => {
      const posts = await repo.readAll();
      const filtered = status ? posts.filter((p) => p.frontmatter.status === status) : posts;
      return json({
        count: filtered.length,
        posts: filtered.map((p) => summarise(p, config)),
      });
    },
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get post',
      description: 'Full Markdown body and metadata for one post.',
      inputSchema: { slug: z.string().describe('The post slug.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ slug }) => {
      if (!(await repo.exists(slug))) return failure(`No post with slug "${slug}".`);
      const post = await repo.read(slug);
      return json({ ...summarise(post, config), body: post.body, frontmatter: post.frontmatter });
    },
  );

  // --------------------------------------------------------------- write side

  server.registerTool(
    'create_post',
    {
      title: 'Create post',
      description:
        'Save a post you have written as a new draft. This is the main way to add content: ' +
        'you do the writing, this stores it for human review. Body is Markdown, without an ' +
        'H1 title (the title is a separate field). Returns the slug to use for later edits.',
      inputSchema: {
        title: z.string().min(1).describe('Post title, in the author\'s voice.'),
        body: z.string().min(1).describe('Markdown body. No H1 — the title is separate.'),
        excerpt: z.string().default('').describe('One or two sentences for previews and search.'),
        tags: z.array(z.string()).default([]).describe('Topic tags.'),
        topic: z.string().default('').describe('The brief or angle this came from.'),
        slug: z
          .string()
          .optional()
          .describe('Override the slug derived from the title. Lowercase, hyphenated.'),
        sources: z
          .array(z.object({ url: z.string(), title: z.string().default('') }))
          .default([])
          .describe('Sources backing any factual claim, so a reviewer can check them.'),
        unsupportedClaims: z
          .array(z.string())
          .default([])
          .describe(
            'Claims you could not source. Be honest here — flagged claims get checked, ' +
              'silent ones get published wrong.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      let slug: string;
      try {
        slug = await repo.allocateSlug(input.title, input.slug);
      } catch (err) {
        return failure(`Could not use that slug: ${(err as Error).message}`);
      }

      const frontmatter = newFrontmatter({
        slug,
        title: input.title,
        topic: input.topic,
        status: 'drafted',
      });
      frontmatter.excerpt = input.excerpt;
      frontmatter.tags = input.tags.length ? input.tags : config.profile.post.defaultTags;
      frontmatter.unsupportedClaims = input.unsupportedClaims;
      frontmatter.sources = input.sources.map((s) => ({
        url: s.url,
        title: s.title,
        accessedAt: new Date().toISOString(),
      }));

      const path = await repo.write({ frontmatter, body: input.body });
      const words = input.body.split(/\s+/).filter(Boolean).length;
      const { minWords, maxWords } = config.profile.post;

      const notes: string[] = [`Saved as ${path} (slug "${slug}", status drafted).`];
      if (words < minWords || words > maxWords) {
        notes.push(
          `Length is ${words} words; the target range is ${minWords}–${maxWords}. ` +
            'Consider revising with update_post.',
        );
      }
      const hits = config.profile.bannedPhrases.filter((phrase) =>
        input.body.toLowerCase().includes(phrase.toLowerCase()),
      );
      if (hits.length) {
        notes.push(`Contains banned phrases: ${hits.join(', ')}. Rewrite those lines.`);
      }
      notes.push('A human reviews and approves before anything is published.');
      return text(notes.join('\n'));
    },
  );

  server.registerTool(
    'update_post',
    {
      title: 'Update post',
      description:
        'Revise a stored post. Only the fields you pass change. A published post is ' +
        'immutable — draft a new one instead.',
      inputSchema: {
        slug: z.string().describe('The post to revise.'),
        title: z.string().optional(),
        body: z.string().optional().describe('Replaces the whole Markdown body.'),
        excerpt: z.string().optional(),
        tags: z.array(z.string()).optional(),
        unsupportedClaims: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ slug, ...patch }) => {
      if (!(await repo.exists(slug))) return failure(`No post with slug "${slug}".`);
      const current = await repo.read(slug);
      if (current.frontmatter.status === 'published') {
        return failure(
          `"${slug}" is already published and cannot be edited. Create a new post instead.`,
        );
      }

      const updated = await repo.update(slug, (post) => {
        if (patch.title !== undefined) post.frontmatter.title = patch.title;
        if (patch.excerpt !== undefined) post.frontmatter.excerpt = patch.excerpt;
        if (patch.tags !== undefined) post.frontmatter.tags = patch.tags;
        if (patch.unsupportedClaims !== undefined) {
          post.frontmatter.unsupportedClaims = patch.unsupportedClaims;
        }
        if (patch.body !== undefined) post.body = patch.body;
        return post;
      });

      const changed = Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);
      return text(
        `Updated ${changed.join(', ') || 'nothing'} on "${slug}". ` +
          `Now ${updated.body.split(/\s+/).filter(Boolean).length} words, status ` +
          `${updated.frontmatter.status}.`,
      );
    },
  );

  server.registerTool(
    'set_post_status',
    {
      title: 'Set post status',
      description:
        'Move a post through the lifecycle: idea -> drafted -> approved -> published. ' +
        'Approving marks a post ready to publish, so only do it when a human asked you to. ' +
        '"published" is set by publish_post, not here.',
      inputSchema: {
        slug: z.string(),
        status: z.enum(['idea', 'drafted', 'approved', 'failed']),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ slug, status }) => {
      if (!(await repo.exists(slug))) return failure(`No post with slug "${slug}".`);
      const current = await repo.read(slug);
      try {
        assertTransition(current.frontmatter.status, status);
      } catch (err) {
        return failure((err as Error).message);
      }
      await repo.update(slug, (post) => {
        post.frontmatter.status = status;
        return post;
      });
      return text(`"${slug}" is now ${status}.`);
    },
  );

  // ------------------------------------------------------------ opt-in: draft

  if (allowDrafting) {
    server.registerTool(
      'draft_post',
      {
        title: 'Draft post with the local pipeline',
        description:
          'Run this repository\'s own pipeline (research, write, edit, fact-check) to produce ' +
          'a post from a topic. Slow and it spends Anthropic API credit — prefer writing the ' +
          'post yourself and calling create_post.',
        inputSchema: {
          topic: z.string().min(1).describe('What to write about.'),
          slug: z.string().optional(),
          research: z
            .boolean()
            .default(true)
            .describe('Use web search. Turn off for opinion pieces.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      async ({ topic, slug, research }) => {
        try {
          requireEnv('ANTHROPIC_API_KEY');
        } catch (err) {
          return failure((err as Error).message);
        }
        const log = new Logger(true, process.stderr);
        const { post, path, usage } = await draftPost(
          { topic, slug, skipResearch: !research },
          { config, llm: new LlmClient(config.model), repo, log },
        );
        return json({
          ...summarise(post, config),
          path,
          estimatedCostUsd: Number(estimateCostUsd(usage).toFixed(3)),
        });
      },
    );
  }

  // ---------------------------------------------------------- opt-in: publish

  if (allowPublish) {
    server.registerTool(
      'publish_post',
      {
        title: 'Publish post',
        description:
          'Publish an approved post to the live blog and, unless skipped, to the author\'s ' +
          'LinkedIn profile. This is public and a LinkedIn post cannot be deleted through ' +
          'this API — confirm with the human first. Requires status "approved".',
        inputSchema: {
          slug: z.string(),
          linkedin: z
            .boolean()
            .default(true)
            .describe('Also post to LinkedIn. Set false to publish only to the blog.'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
      async ({ slug, linkedin }) => {
        if (!(await repo.exists(slug))) return failure(`No post with slug "${slug}".`);
        const post = await repo.read(slug);
        if (post.frontmatter.status !== 'approved') {
          return failure(
            `"${slug}" is ${post.frontmatter.status}, not approved. A human approves before publishing.`,
          );
        }
        if (linkedin && post.frontmatter.linkedin.postUrn) {
          return failure(
            `"${slug}" already has LinkedIn post ${post.frontmatter.linkedin.postUrn}. ` +
              'Re-posting would duplicate it; pass linkedin: false to publish the blog only.',
          );
        }

        const log = new Logger(true, process.stderr);
        try {
          const websitePublisher = new WebsitePublisher(
            config.website,
            requireEnv(config.website.tokenEnv),
          );
          const linkedinPublisher = linkedin
            ? new LinkedInPublisher(config.linkedin, {
                accessToken: requireEnv(config.linkedin.tokenEnv),
                personUrn: requireEnv(config.linkedin.personUrnEnv),
              })
            : undefined;

          const result = await publishPost(post, {
            config,
            llm: new LlmClient(config.model),
            repo,
            log,
            websitePublisher,
            linkedinPublisher,
            skipLinkedIn: !linkedin,
          });
          return json({
            websiteUrl: result.websiteUrl,
            linkedinPostUrn: result.linkedinPostUrn ?? null,
            estimatedCostUsd: Number(estimateCostUsd(result.usage).toFixed(3)),
          });
        } catch (err) {
          return failure(`Publishing "${slug}" failed: ${(err as Error).message}`);
        }
      },
    );
  }

  return server;
}

/** Exported for the slug-preview used in tests and the CLI. */
export { slugify, uniqueSlug };
