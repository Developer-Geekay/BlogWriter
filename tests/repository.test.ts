import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PostRepository, newFrontmatter, parsePost, serializePost } from '../src/store/repository.js';
import { InvalidTransitionError, canTransition, type Post } from '../src/store/post.js';

function samplePost(slug = 'a-test-post'): Post {
  return {
    frontmatter: {
      ...newFrontmatter({ slug, title: 'A Test Post', topic: 'testing' }),
      excerpt: 'An excerpt.',
      tags: ['testing', 'node'],
      sources: [{ url: 'https://example.com/a', title: 'Source A', accessedAt: '2026-07-29' }],
      unsupportedClaims: ['"99% faster" — no source supports this number'],
    },
    body: '## Heading\n\nBody text with a [link](https://example.com/a).\n\n- item one\n- item two',
  };
}

describe('front matter round-trip', () => {
  it('survives serialize → parse unchanged', () => {
    const post = samplePost();
    const parsed = parsePost(serializePost(post));

    expect(parsed.frontmatter).toEqual(post.frontmatter);
    expect(parsed.body).toBe(post.body);
  });

  it('preserves Markdown structure including lists and links', () => {
    const post = samplePost();
    const parsed = parsePost(serializePost(post));
    expect(parsed.body).toContain('[link](https://example.com/a)');
    expect(parsed.body).toContain('- item two');
  });

  it('preserves body content containing YAML-like lines', () => {
    const post = samplePost();
    post.body = 'Config looks like:\n\n```yaml\ntitle: not front matter\n---\n```';
    const parsed = parsePost(serializePost(post));
    expect(parsed.body).toBe(post.body);
  });

  it('applies schema defaults to sparse front matter', () => {
    const raw = ['---', 'id: 01ABC', 'slug: x', 'title: X', 'createdAt: 2026-07-29', '---', '', 'Body'].join('\n');
    const parsed = parsePost(raw);

    expect(parsed.frontmatter.status).toBe('drafted');
    expect(parsed.frontmatter.tags).toEqual([]);
    expect(parsed.frontmatter.website.status).toBe('pending');
    expect(parsed.frontmatter.linkedin.postUrn).toBeNull();
  });

  it('accepts unquoted dates, which YAML turns into Date objects', () => {
    // This is what a hand-edited file looks like after review — nobody quotes
    // their dates. YAML gives us a Date; the schema must cope.
    const raw = [
      '---',
      'id: 01ABC',
      'slug: x',
      'title: X',
      'createdAt: 2026-07-29T10:00:00.000Z',
      'publishDate: 2026-07-29',
      '---',
      '',
      'Body',
    ].join('\n');
    const parsed = parsePost(raw);

    expect(typeof parsed.frontmatter.createdAt).toBe('string');
    expect(parsed.frontmatter.publishDate).toBe('2026-07-29');
  });

  it('reports which field is wrong when front matter is invalid', () => {
    const raw = ['---', 'id: 01ABC', 'slug: x', 'title: X', 'createdAt: 2026-07-29', 'tags: nope', '---', 'Body'].join('\n');
    expect(() => parsePost(raw, 'broken')).toThrow(/broken\.md[\s\S]*tags/);
  });
});

describe('status transitions', () => {
  it('allows the happy path', () => {
    expect(canTransition('drafted', 'approved')).toBe(true);
    expect(canTransition('approved', 'published')).toBe(true);
  });

  it('refuses to skip the review gate', () => {
    expect(canTransition('drafted', 'published')).toBe(false);
  });

  it('treats published as terminal', () => {
    expect(canTransition('published', 'drafted')).toBe(false);
  });
});

describe('PostRepository', () => {
  let dir: string;
  let repo: PostRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'blogwriter-'));
    repo = new PostRepository(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns an empty list before anything is written', async () => {
    expect(await repo.listSlugs()).toEqual([]);
    expect(await repo.readAll()).toEqual([]);
  });

  it('writes and reads a post', async () => {
    const post = samplePost();
    await repo.write(post);

    expect(await repo.exists('a-test-post')).toBe(true);
    const read = await repo.read('a-test-post');
    expect(read.frontmatter.title).toBe('A Test Post');
    expect(read.body).toBe(post.body);
  });

  it('stamps updatedAt on every write', async () => {
    const post = samplePost();
    post.frontmatter.updatedAt = '';
    await repo.write(post);
    expect((await repo.read('a-test-post')).frontmatter.updatedAt).not.toBe('');
  });

  it('allocates a non-colliding slug', async () => {
    await repo.write(samplePost('a-test-post'));
    expect(await repo.allocateSlug('A Test Post')).toBe('a-test-post-2');
  });

  it('enforces transitions on update', async () => {
    await repo.write(samplePost());
    await expect(
      repo.update('a-test-post', (p) => ({
        ...p,
        frontmatter: { ...p.frontmatter, status: 'published' },
      })),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it('permits a legal transition on update', async () => {
    await repo.write(samplePost());
    const updated = await repo.update('a-test-post', (p) => ({
      ...p,
      frontmatter: { ...p.frontmatter, status: 'approved' },
    }));
    expect(updated.frontmatter.status).toBe('approved');
  });

  it('sorts readAll newest first', async () => {
    const older = samplePost('older');
    older.frontmatter.createdAt = '2026-01-01T00:00:00.000Z';
    const newer = samplePost('newer');
    newer.frontmatter.createdAt = '2026-07-01T00:00:00.000Z';
    await repo.write(older);
    await repo.write(newer);

    expect((await repo.readAll()).map((p) => p.frontmatter.slug)).toEqual(['newer', 'older']);
  });

  it('refuses to write a post whose slug the API would reject', async () => {
    const post = samplePost();
    post.frontmatter.slug = 'Not Valid';
    await expect(repo.write(post)).rejects.toThrow(/Invalid slug/);
  });
});
