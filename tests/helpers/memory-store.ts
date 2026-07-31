import {
  PostNotFoundError,
  SlugTakenError,
  type ListOptions,
  type PostReadWrite,
} from '../../src/db/posts.js';
import { readingTimeMinutes, type Post, type PostCreate, type PostUpdate } from '../../src/db/types.js';
import { assertValidSlug, slugify, uniqueSlug } from '../../src/store/slug.js';

/**
 * In-memory `PostReadWrite`, mirroring the MongoDB implementation's observable
 * behaviour: slug allocation and collision suffixes, reading-time derivation,
 * publish-date stamping on first publish, and the same error types.
 *
 * MongoDB cannot run in this environment, so the tool layer is verified against
 * this instead. It is a test double for the store, not for the tools.
 */
export class MemoryPostStore implements PostReadWrite {
  private readonly rows = new Map<string, Post>();
  private nextId = 1;

  async list(options: ListOptions = {}): Promise<Post[]> {
    let found = [...this.rows.values()];
    if (options.status) found = found.filter((p) => p.status === options.status);
    if (options.tag) found = found.filter((p) => p.tags.includes(options.tag!));
    if (options.search?.trim()) {
      const needle = options.search.trim().toLowerCase();
      found = found.filter(
        (p) =>
          p.title.toLowerCase().includes(needle) ||
          p.excerpt.toLowerCase().includes(needle) ||
          p.tags.some((t) => t.toLowerCase().includes(needle)) ||
          p.body.toLowerCase().includes(needle),
      );
    }
    found.sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
    return found.slice(options.skip ?? 0, (options.skip ?? 0) + (options.limit ?? 100));
  }

  async findBySlug(slug: string): Promise<Post | null> {
    return [...this.rows.values()].find((p) => p.slug === slug) ?? null;
  }

  async findById(id: string): Promise<Post | null> {
    return this.rows.get(id) ?? null;
  }

  async create(input: PostCreate): Promise<Post> {
    const desired = input.slug?.trim() ? input.slug.trim() : slugify(input.title);
    assertValidSlug(desired);
    const slug = uniqueSlug(desired, [...this.rows.values()].map((p) => p.slug));

    const now = new Date().toISOString();
    const post: Post = {
      id: String(this.nextId++),
      slug,
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImage: input.coverImage,
      tags: input.tags,
      status: input.status,
      readingTime: readingTimeMinutes(input.body),
      createdAt: now,
      updatedAt: now,
      publishedAt: input.status === 'published' ? now : null,
      sources: input.sources,
      unsupportedClaims: input.unsupportedClaims,
      linkedin: { status: 'pending', postUrn: null, publishedAt: null },
    };
    this.rows.set(post.id, post);
    return post;
  }

  async update(id: string, patch: PostUpdate): Promise<Post> {
    const existing = this.rows.get(id);
    if (!existing) throw new PostNotFoundError(id);

    const next: Post = { ...existing, updatedAt: new Date().toISOString() };

    if (patch.slug !== undefined && patch.slug !== existing.slug) {
      const slug = patch.slug.trim();
      assertValidSlug(slug);
      if ([...this.rows.values()].some((p) => p.slug === slug && p.id !== id)) {
        throw new SlugTakenError(slug);
      }
      next.slug = slug;
    }
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.excerpt !== undefined) next.excerpt = patch.excerpt;
    if (patch.coverImage !== undefined) next.coverImage = patch.coverImage;
    if (patch.tags !== undefined) next.tags = patch.tags;
    if (patch.sources !== undefined) next.sources = patch.sources;
    if (patch.unsupportedClaims !== undefined) next.unsupportedClaims = patch.unsupportedClaims;
    if (patch.body !== undefined) {
      next.body = patch.body;
      next.readingTime = readingTimeMinutes(patch.body);
    }
    if (patch.status !== undefined) {
      next.status = patch.status;
      if (patch.status === 'published' && !existing.publishedAt) {
        next.publishedAt = new Date().toISOString();
      }
    }

    this.rows.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    if (!this.rows.delete(id)) throw new PostNotFoundError(id);
  }
}
