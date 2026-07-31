import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpServer } from '../src/mcp/server.js';
import { ProfileSchema, TopicsSchema } from '../src/config/schema.js';
import { MemoryPostStore } from './helpers/memory-store.js';

const profile = ProfileSchema.parse({
  author: { name: 'Test Author' },
  audience: 'Engineers who ship',
  voice: { description: 'Direct and concrete.', do: ['Use specifics'], dont: ['Pad'] },
  bannedPhrases: ["in today's fast-paced world"],
  post: { minWords: 10, maxWords: 100, defaultTags: ['engineering'] },
  linkedin: {},
});

const topics = TopicsSchema.parse({ themes: ['retrieval'], backlog: ['context windows'] });

const BODY = 'A body with comfortably more than ten words in it, to clear the minimum.';

async function connect(options: { allowPublish?: boolean; withProfile?: boolean } = {}) {
  const posts = new MemoryPostStore();
  const server = buildMcpServer({
    posts,
    ...(options.withProfile === false ? {} : { profile, topics }),
    allowPublish: options.allowPublish ?? false,
    siteUrl: 'https://example.com',
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, posts };
}

function resultText(result: CallToolResult): string {
  return result.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

async function call(
  client: Client,
  name: string,
  args?: Record<string, unknown>,
): Promise<CallToolResult> {
  return (await client.callTool({ name, ...(args ? { arguments: args } : {}) })) as CallToolResult;
}

/** Create a post and return its id. */
async function seed(client: Client, title: string, extra: Record<string, unknown> = {}) {
  const result = await call(client, 'create_post', { title, body: BODY, ...extra });
  const id = /id (\S+?)\)/.exec(resultText(result))?.[1];
  expect(id, resultText(result)).toBeDefined();
  return id!;
}

describe('tool surface', () => {
  it('withholds publishing and deletion unless the portal allows it', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();

    expect(names).toEqual(['create_post', 'get_post', 'get_voice_guide', 'list_posts', 'update_post']);
  });

  it('adds set_post_status and delete_post when publishing is allowed', async () => {
    const { client } = await connect({ allowPublish: true });
    const names = (await client.listTools()).tools.map((t) => t.name);

    expect(names).toContain('set_post_status');
    expect(names).toContain('delete_post');
  });

  it('omits the voice guide when no profile is configured', async () => {
    const { client } = await connect({ withProfile: false });
    const names = (await client.listTools()).tools.map((t) => t.name);

    expect(names).not.toContain('get_voice_guide');
  });

  it('marks read-only tools so clients can skip a confirmation prompt', async () => {
    const { client } = await connect({ allowPublish: true });
    const tools = (await client.listTools()).tools;

    expect(tools.find((t) => t.name === 'get_post')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'set_post_status')?.annotations?.destructiveHint).toBe(true);
  });
});

describe('get_voice_guide', () => {
  // A zero-argument tool must work when the client omits `arguments` entirely,
  // which the protocol permits; declaring an input schema would reject it.
  it('accepts a call with no arguments field', async () => {
    const { client } = await connect();
    const result = await call(client, 'get_voice_guide');

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).not.toContain('validation error');
  });

  it('returns the voice, banned phrases, and topic backlog', async () => {
    const { client } = await connect();
    const guide = JSON.parse(resultText(await call(client, 'get_voice_guide')));

    expect(guide.voice.description).toBe('Direct and concrete.');
    expect(guide.bannedPhrases).toContain("in today's fast-paced world");
    expect(guide.topics.backlog).toContain('context windows');
    expect(guide.lengthTarget).toEqual({ minWords: 10, maxWords: 100 });
  });
});

describe('create_post', () => {
  it('always creates a draft, never a published post', async () => {
    const { client, posts } = await connect({ allowPublish: true });
    await seed(client, 'Retrieval Beats Context Size');

    const [stored] = await posts.list();
    expect(stored!.status).toBe('draft');
    expect(stored!.publishedAt).toBeNull();
    expect(stored!.slug).toBe('retrieval-beats-context-size');
  });

  it('tells the caller the post is not public yet', async () => {
    const { client } = await connect();
    const result = await call(client, 'create_post', { title: 'A Post', body: BODY });

    expect(resultText(result)).toContain('not public yet');
  });

  it('warns about banned phrases rather than silently accepting them', async () => {
    const { client } = await connect();
    const result = await call(client, 'create_post', {
      title: 'Bad Voice',
      body: "In today's fast-paced world, engineers need at least ten words to pass this check.",
    });

    expect(resultText(result)).toContain('banned phrases');
  });

  it('warns when the body misses the length target', async () => {
    const { client } = await connect();
    const result = await call(client, 'create_post', { title: 'Too Short', body: 'Three words only.' });

    expect(resultText(result)).toContain('10–100');
  });

  it('gives a colliding title a distinct slug instead of overwriting', async () => {
    const { client, posts } = await connect();
    await seed(client, 'Same Title');
    await seed(client, 'Same Title');

    expect((await posts.list()).map((p) => p.slug).sort()).toEqual(['same-title', 'same-title-2']);
  });

  it('rejects a slug the blog API would not accept', async () => {
    const { client } = await connect();
    const result = await call(client, 'create_post', {
      title: 'Bad Slug',
      body: BODY,
      slug: 'Not A Valid Slug!',
    });

    expect(result.isError).toBe(true);
  });
});

describe('update_post', () => {
  it('changes only the fields that were passed', async () => {
    const { client, posts } = await connect();
    const id = await seed(client, 'Editable');

    await call(client, 'update_post', { id, title: 'Edited Title' });

    const post = await posts.findById(id);
    expect(post!.title).toBe('Edited Title');
    expect(post!.body).toBe(BODY);
  });

  it('recomputes reading time when the body changes', async () => {
    const { client, posts } = await connect();
    const id = await seed(client, 'Growing');

    await call(client, 'update_post', { id, body: 'word '.repeat(1000) });

    expect((await posts.findById(id))!.readingTime).toBe(5);
  });

  it('reports an error for an unknown id', async () => {
    const { client } = await connect();
    const result = await call(client, 'update_post', { id: 'nope', title: 'x' });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('nope');
  });

  it('rejects a call that changes nothing', async () => {
    const { client } = await connect();
    const id = await seed(client, 'Unchanged');
    const result = await call(client, 'update_post', { id });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('at least one field');
  });
});

describe('publishing', () => {
  it('is not reachable at all when the portal disallows it', async () => {
    const { client } = await connect({ allowPublish: false });
    const id = await seed(client, 'Stays Private');

    // The tool is unregistered, so dispatch fails outright rather than the call
    // quietly succeeding — this is the toggle doing its job.
    const result = await call(client, 'set_post_status', { id, status: 'published' });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('not found');
  });

  it('publishes and reports the public URL when allowed', async () => {
    const { client, posts } = await connect({ allowPublish: true });
    const id = await seed(client, 'Goes Live');

    const result = await call(client, 'set_post_status', { id, status: 'published' });

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('https://example.com/blog/goes-live');
    const post = await posts.findById(id);
    expect(post!.status).toBe('published');
    expect(post!.publishedAt).not.toBeNull();
  });

  it('keeps the original publish date when re-publishing an edit', async () => {
    const { client, posts } = await connect({ allowPublish: true });
    const id = await seed(client, 'Republished');

    await call(client, 'set_post_status', { id, status: 'published' });
    const first = (await posts.findById(id))!.publishedAt;
    await call(client, 'set_post_status', { id, status: 'draft' });
    await call(client, 'set_post_status', { id, status: 'published' });

    expect((await posts.findById(id))!.publishedAt).toBe(first);
  });

  it('deletes a post when allowed', async () => {
    const { client, posts } = await connect({ allowPublish: true });
    const id = await seed(client, 'Doomed');

    await call(client, 'delete_post', { id });

    expect(await posts.findById(id)).toBeNull();
  });
});

describe('list_posts and get_post', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await connect({ allowPublish: true }));
    const first = await seed(client, 'First Post', { tags: ['alpha'] });
    await seed(client, 'Second Post', { tags: ['beta'] });
    await call(client, 'set_post_status', { id: first, status: 'published' });
  });

  it('filters by status', async () => {
    const all = JSON.parse(resultText(await call(client, 'list_posts', {})));
    expect(all.count).toBe(2);

    const published = JSON.parse(
      resultText(await call(client, 'list_posts', { status: 'published' })),
    );
    expect(published.count).toBe(1);
    expect(published.posts[0].slug).toBe('first-post');
  });

  it('exposes the public URL only for published posts', async () => {
    const all = JSON.parse(resultText(await call(client, 'list_posts', {})));
    const [published, draft] = [
      all.posts.find((p: { status: string }) => p.status === 'published'),
      all.posts.find((p: { status: string }) => p.status === 'draft'),
    ];

    expect(published.url).toBe('https://example.com/blog/first-post');
    expect(draft.url).toBeUndefined();
  });

  it('searches titles and tags', async () => {
    const found = JSON.parse(resultText(await call(client, 'list_posts', { search: 'beta' })));

    expect(found.count).toBe(1);
    expect(found.posts[0].title).toBe('Second Post');
  });

  it('returns the full body by slug', async () => {
    const post = JSON.parse(resultText(await call(client, 'get_post', { slug: 'first-post' })));

    expect(post.body).toBe(BODY);
  });

  it('requires either a slug or an id', async () => {
    const result = await call(client, 'get_post', {});

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('slug or an id');
  });
});
