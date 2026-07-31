import { ObjectId, type Collection, type Db, type Filter, type WithId } from 'mongodb';
import { getDb } from './client.js';
import {
  PostSchema,
  readingTimeMinutes,
  type Post,
  type PostCreate,
  type PostStatus,
  type PostUpdate,
} from './types.js';
import { assertValidSlug, slugify, uniqueSlug } from '../store/slug.js';

interface PostDocument {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImage: string | null;
  tags: string[];
  status: PostStatus;
  readingTime: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  sources: { url: string; title: string }[];
  unsupportedClaims: string[];
  linkedin: {
    status: 'pending' | 'published' | 'failed' | 'skipped';
    postUrn: string | null;
    publishedAt: Date | null;
  };
}

const iso = (value: Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

/** BSON in, plain JSON-safe object out. Nothing above this layer sees ObjectId. */
function toPost(doc: WithId<PostDocument>): Post {
  return PostSchema.parse({
    id: doc._id.toHexString(),
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt ?? '',
    body: doc.body ?? '',
    coverImage: doc.coverImage ?? null,
    tags: doc.tags ?? [],
    status: doc.status,
    readingTime: doc.readingTime ?? readingTimeMinutes(doc.body ?? ''),
    createdAt: iso(doc.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(doc.updatedAt) ?? new Date().toISOString(),
    publishedAt: iso(doc.publishedAt),
    sources: doc.sources ?? [],
    unsupportedClaims: doc.unsupportedClaims ?? [],
    linkedin: {
      status: doc.linkedin?.status ?? 'pending',
      postUrn: doc.linkedin?.postUrn ?? null,
      publishedAt: iso(doc.linkedin?.publishedAt ?? null),
    },
  });
}

export class PostNotFoundError extends Error {
  constructor(reference: string) {
    super(`No post matching "${reference}".`);
    this.name = 'PostNotFoundError';
  }
}

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`The slug "${slug}" is already used by another post.`);
    this.name = 'SlugTakenError';
  }
}

export interface ListOptions {
  status?: PostStatus;
  tag?: string;
  search?: string;
  limit?: number;
  skip?: number;
}

/**
 * The slice of the store the MCP tools need.
 *
 * Depending on this rather than the concrete class keeps the tool layer free of
 * MongoDB, so its behaviour can be tested without a running database.
 */
export interface PostReadWrite {
  list(options?: ListOptions): Promise<Post[]>;
  findBySlug(slug: string): Promise<Post | null>;
  findById(id: string): Promise<Post | null>;
  create(input: PostCreate): Promise<Post>;
  update(id: string, patch: PostUpdate): Promise<Post>;
  delete(id: string): Promise<void>;
}

export class PostStore implements PostReadWrite {
  private constructor(private readonly posts: Collection<PostDocument>) {}

  static async open(db?: Db): Promise<PostStore> {
    const database = db ?? (await getDb());
    return new PostStore(database.collection<PostDocument>('posts'));
  }

  private buildFilter({ status, tag, search }: ListOptions): Filter<PostDocument> {
    const filter: Filter<PostDocument> = {};
    if (status) filter.status = status;
    if (tag) filter.tags = tag;
    // Regex rather than $text so partial words match while the user is typing.
    if (search?.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }, { tags: rx }];
    }
    return filter;
  }

  async list(options: ListOptions = {}): Promise<Post[]> {
    const docs = await this.posts
      .find(this.buildFilter(options))
      // Published posts read newest-first by publish date; drafts have none, so
      // fall back to update time to keep work-in-progress at the top.
      .sort({ publishedAt: -1, updatedAt: -1 })
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 100)
      .toArray();
    return docs.map(toPost);
  }

  async count(options: ListOptions = {}): Promise<number> {
    return this.posts.countDocuments(this.buildFilter(options));
  }

  async findBySlug(slug: string): Promise<Post | null> {
    const doc = await this.posts.findOne({ slug });
    return doc ? toPost(doc) : null;
  }

  async findById(id: string): Promise<Post | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.posts.findOne({ _id: new ObjectId(id) });
    return doc ? toPost(doc) : null;
  }

  /** Every distinct tag in use, with post counts, for the tag pages. */
  async tags(): Promise<{ tag: string; count: number }[]> {
    const rows = await this.posts
      .aggregate<{ _id: string; count: number }>([
        { $match: { status: 'published' } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ])
      .toArray();
    return rows.map((r) => ({ tag: r._id, count: r.count }));
  }

  /** Derive a free slug from the title, or validate the one supplied. */
  async allocateSlug(title: string, preferred?: string): Promise<string> {
    const desired = preferred?.trim() ? preferred.trim() : slugify(title);
    assertValidSlug(desired);
    const clashes = await this.posts
      .find({ slug: { $regex: `^${desired}(-\\d+)?$` } })
      .project<{ slug: string }>({ slug: 1 })
      .toArray();
    return uniqueSlug(desired, clashes.map((c) => c.slug));
  }

  async create(input: PostCreate): Promise<Post> {
    const now = new Date();
    const slug = await this.allocateSlug(input.title, input.slug);
    const publishing = input.status === 'published';

    const doc: PostDocument = {
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
      publishedAt: publishing ? now : null,
      sources: input.sources,
      unsupportedClaims: input.unsupportedClaims,
      linkedin: { status: 'pending', postUrn: null, publishedAt: null },
    };

    const result = await this.posts.insertOne(doc);
    return toPost({ ...doc, _id: result.insertedId });
  }

  async update(id: string, patch: PostUpdate): Promise<Post> {
    const existing = await this.findById(id);
    if (!existing) throw new PostNotFoundError(id);

    const set: Partial<PostDocument> = { updatedAt: new Date() };

    if (patch.slug !== undefined && patch.slug !== existing.slug) {
      const slug = patch.slug.trim();
      assertValidSlug(slug);
      if (await this.posts.findOne({ slug, _id: { $ne: new ObjectId(id) } })) {
        throw new SlugTakenError(slug);
      }
      set.slug = slug;
    }
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.excerpt !== undefined) set.excerpt = patch.excerpt;
    if (patch.coverImage !== undefined) set.coverImage = patch.coverImage;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.sources !== undefined) set.sources = patch.sources;
    if (patch.unsupportedClaims !== undefined) set.unsupportedClaims = patch.unsupportedClaims;
    if (patch.body !== undefined) {
      set.body = patch.body;
      set.readingTime = readingTimeMinutes(patch.body);
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
      // Stamp the publish date the first time it goes live, and never move it
      // afterwards — re-publishing an edit should not reorder the feed.
      if (patch.status === 'published' && !existing.publishedAt) set.publishedAt = new Date();
    }

    const updated = await this.posts.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: set },
      { returnDocument: 'after' },
    );
    if (!updated) throw new PostNotFoundError(id);
    return toPost(updated);
  }

  async delete(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) throw new PostNotFoundError(id);
    const result = await this.posts.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) throw new PostNotFoundError(id);
  }

  /** Record the outcome of a LinkedIn cross-post. */
  async recordLinkedIn(id: string, postUrn: string): Promise<Post> {
    const updated = await this.posts.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          updatedAt: new Date(),
          linkedin: { status: 'published', postUrn, publishedAt: new Date() },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new PostNotFoundError(id);
    return toPost(updated);
  }
}
