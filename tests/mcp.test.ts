import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpServer } from '../src/mcp/server.js';
import { AppConfigSchema, type AppConfig } from '../src/config/schema.js';
import { PostRepository } from '../src/store/repository.js';

function testConfig(contentDir: string): AppConfig {
  return AppConfigSchema.parse({
    profile: {
      author: { name: 'Test Author' },
      audience: 'Engineers who ship',
      voice: {
        description: 'Direct and concrete.',
        do: ['Use specifics'],
        dont: ['Pad with filler'],
      },
      bannedPhrases: ['in today\'s fast-paced world'],
      post: { minWords: 10, maxWords: 100, defaultTags: ['engineering'] },
      linkedin: {},
    },
    topics: { themes: ['retrieval'], backlog: ['context windows'] },
    website: {},
    linkedin: {},
    model: {},
    contentDir,
  });
}

/** Connect an in-memory client to the server so calls go over real JSON-RPC. */
async function connect(config: AppConfig, options: { allowPublish?: boolean } = {}) {
  const server = buildMcpServer({ config, ...options });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

/** The text of a tool result, for assertions. */
function resultText(result: CallToolResult): string {
  return result.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

let dir: string;
let config: AppConfig;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'blogwriter-mcp-'));
  config = testConfig(path.join(dir, 'posts'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('tool surface', () => {
  it('exposes the read and write tools but not publishing by default', async () => {
    const { client } = await connect(config);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();

    expect(names).toEqual([
      'create_post',
      'get_post',
      'get_voice_guide',
      'list_posts',
      'set_post_status',
      'update_post',
    ]);
  });

  it('registers publish_post only when explicitly allowed', async () => {
    const { client } = await connect(config, { allowPublish: true });
    const names = (await client.listTools()).tools.map((t) => t.name);

    expect(names).toContain('publish_post');
  });

  it('marks read-only tools as such so clients can skip confirmation', async () => {
    const { client } = await connect(config);
    const tools = (await client.listTools()).tools;

    expect(tools.find((t) => t.name === 'get_post')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'create_post')?.annotations?.readOnlyHint).toBe(false);
  });
});

describe('get_voice_guide', () => {
  // A zero-argument tool must work when the client omits `arguments`, which the
  // protocol permits. Declaring an (empty) input schema makes the SDK reject it.
  it('accepts a call with no arguments field at all', async () => {
    const { client } = await connect(config);
    const result = (await client.callTool({ name: 'get_voice_guide' })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).not.toContain('validation error');
  });

  it('returns the voice, banned phrases, and topic backlog', async () => {
    const { client } = await connect(config);
    const guide = JSON.parse(
      resultText((await client.callTool({ name: 'get_voice_guide' })) as CallToolResult),
    );

    expect(guide.voice.description).toBe('Direct and concrete.');
    expect(guide.bannedPhrases).toContain('in today\'s fast-paced world');
    expect(guide.topics.backlog).toContain('context windows');
    expect(guide.audience).toBe('Engineers who ship');
  });
});

describe('create_post', () => {
  it('writes a drafted post the repository can read back', async () => {
    const { client } = await connect(config);
    const body = 'A body with more than ten words in it, comfortably inside the range.';

    const result = (await client.callTool({
      name: 'create_post',
      arguments: { title: 'Retrieval Beats Context Size', body, excerpt: 'Why.' },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('retrieval-beats-context-size');

    const post = await new PostRepository(config.contentDir).read('retrieval-beats-context-size');
    expect(post.frontmatter.status).toBe('drafted');
    expect(post.frontmatter.title).toBe('Retrieval Beats Context Size');
    expect(post.body).toBe(body);
  });

  it('applies default tags when none are given', async () => {
    const { client } = await connect(config);
    await client.callTool({
      name: 'create_post',
      arguments: { title: 'Post One', body: 'ten words here to clear the minimum bar for length ok' },
    });

    const post = await new PostRepository(config.contentDir).read('post-one');
    expect(post.frontmatter.tags).toEqual(['engineering']);
  });

  it('warns about banned phrases instead of silently accepting them', async () => {
    const { client } = await connect(config);
    const result = (await client.callTool({
      name: 'create_post',
      arguments: {
        title: 'Bad Voice',
        body: "In today's fast-paced world, engineers need ten or more words to pass the check.",
      },
    })) as CallToolResult;

    expect(resultText(result)).toContain('banned phrases');
  });

  it('warns when the body misses the length target', async () => {
    const { client } = await connect(config);
    const result = (await client.callTool({
      name: 'create_post',
      arguments: { title: 'Too Short', body: 'Three words only.' },
    })) as CallToolResult;

    expect(resultText(result)).toContain('10–100');
  });

  it('gives a second post a distinct slug rather than overwriting the first', async () => {
    const { client } = await connect(config);
    const args = { body: 'a body with at least ten words in it to pass the length check' };
    await client.callTool({ name: 'create_post', arguments: { title: 'Same Title', ...args } });
    await client.callTool({ name: 'create_post', arguments: { title: 'Same Title', ...args } });

    const slugs = await new PostRepository(config.contentDir).listSlugs();
    expect(slugs).toEqual(['same-title', 'same-title-2']);
  });
});

describe('update_post', () => {
  const body = 'An original body long enough to clear the ten word minimum for this test.';

  beforeEach(async () => {
    const { client } = await connect(config);
    await client.callTool({
      name: 'create_post',
      arguments: { title: 'Editable', body },
    });
  });

  it('changes only the fields that were passed', async () => {
    const { client } = await connect(config);
    await client.callTool({
      name: 'update_post',
      arguments: { slug: 'editable', title: 'Edited Title' },
    });

    const post = await new PostRepository(config.contentDir).read('editable');
    expect(post.frontmatter.title).toBe('Edited Title');
    expect(post.body).toBe(body);
  });

  it('reports an error for an unknown slug', async () => {
    const { client } = await connect(config);
    const result = (await client.callTool({
      name: 'update_post',
      arguments: { slug: 'does-not-exist', title: 'x' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('does-not-exist');
  });

  it('refuses to edit a published post', async () => {
    const repo = new PostRepository(config.contentDir);
    await repo.update('editable', (post) => {
      post.frontmatter.status = 'approved';
      return post;
    });
    await repo.update('editable', (post) => {
      post.frontmatter.status = 'published';
      return post;
    });

    const { client } = await connect(config);
    const result = (await client.callTool({
      name: 'update_post',
      arguments: { slug: 'editable', body: 'rewritten' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('already published');
  });
});

describe('set_post_status', () => {
  beforeEach(async () => {
    const { client } = await connect(config);
    await client.callTool({
      name: 'create_post',
      arguments: { title: 'Gated', body: 'a body with at least ten words in it for the checker' },
    });
  });

  it('moves a drafted post to approved', async () => {
    const { client } = await connect(config);
    const result = (await client.callTool({
      name: 'set_post_status',
      arguments: { slug: 'gated', status: 'approved' },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const post = await new PostRepository(config.contentDir).read('gated');
    expect(post.frontmatter.status).toBe('approved');
  });

  it('rejects an illegal transition with the reason', async () => {
    const { client } = await connect(config);
    await client.callTool({ name: 'set_post_status', arguments: { slug: 'gated', status: 'approved' } });
    const result = (await client.callTool({
      name: 'set_post_status',
      arguments: { slug: 'gated', status: 'idea' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Cannot move a post from "approved" to "idea"');
  });
});

describe('list_posts', () => {
  it('filters by status', async () => {
    const { client } = await connect(config);
    const body = 'a body with at least ten words in it to satisfy the length check';
    await client.callTool({ name: 'create_post', arguments: { title: 'First', body } });
    await client.callTool({ name: 'create_post', arguments: { title: 'Second', body } });
    await client.callTool({ name: 'set_post_status', arguments: { slug: 'first', status: 'approved' } });

    const all = JSON.parse(
      resultText(
        (await client.callTool({ name: 'list_posts', arguments: {} })) as CallToolResult,
      ),
    );
    expect(all.count).toBe(2);

    const approved = JSON.parse(
      resultText(
        (await client.callTool({
          name: 'list_posts',
          arguments: { status: 'approved' },
        })) as CallToolResult,
      ),
    );
    expect(approved.count).toBe(1);
    expect(approved.posts[0].slug).toBe('first');
  });
});

describe('publish_post guards', () => {
  it('refuses to publish a post that has not been approved', async () => {
    const { client } = await connect(config, { allowPublish: true });
    await client.callTool({
      name: 'create_post',
      arguments: { title: 'Unapproved', body: 'a body with at least ten words in it here now' },
    });

    const result = (await client.callTool({
      name: 'publish_post',
      arguments: { slug: 'unapproved' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('not approved');
  });

  it('refuses to re-post to LinkedIn when a post URN is already recorded', async () => {
    const { client } = await connect(config, { allowPublish: true });
    await client.callTool({
      name: 'create_post',
      arguments: { title: 'Already Posted', body: 'a body with at least ten words in it right here' },
    });
    const repo = new PostRepository(config.contentDir);
    await repo.update('already-posted', (post) => {
      post.frontmatter.status = 'approved';
      post.frontmatter.linkedin.postUrn = 'urn:li:share:12345';
      return post;
    });

    const result = (await client.callTool({
      name: 'publish_post',
      arguments: { slug: 'already-posted' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('urn:li:share:12345');
  });
});
