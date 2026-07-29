import type { WebsiteConfig } from '../config/schema.js';
import { assertValidSlug } from '../store/slug.js';
import { postUrl, type Post } from '../store/post.js';
import { PublishError, requestJson } from './types.js';

const TARGET = 'website';

/** The payload shape accepted by `POST /api/posts` on gokulakannan.dev. */
export interface BlogApiPost {
  slug: string;
  title: string;
  date?: string;
  tags?: string[];
  excerpt?: string;
  published?: boolean;
  content?: string;
}

/**
 * Publisher for the gokulakannan.dev Blog Posts API.
 *
 * `POST /api/posts` is an upsert keyed by slug (`findOneAndUpdate` with
 * `upsert: true`), so every write here is idempotent and safe to retry — a
 * failed publish just gets re-run rather than needing compensating logic.
 */
export class WebsitePublisher {
  constructor(
    private readonly config: WebsiteConfig,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get endpoint(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${this.config.postsPath}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /** Map our front matter onto the API's field names. */
  static toApiPayload(post: Post, published: boolean): BlogApiPost {
    const { frontmatter: fm } = post;
    return {
      slug: fm.slug,
      title: fm.title,
      date: fm.publishDate || new Date().toISOString().slice(0, 10),
      tags: fm.tags,
      excerpt: fm.excerpt,
      published,
      content: post.body,
    };
  }

  /**
   * Create or update the post.
   *
   * `published: false` puts it on the site as a draft — visible via the
   * authenticated API and (pending verification) the admin-session blog page,
   * which is what makes preview-before-approve possible.
   */
  async upsert(post: Post, { published }: { published: boolean }): Promise<string> {
    assertValidSlug(post.frontmatter.slug);

    await requestJson<{ slug: string }>(this.endpoint, {
      target: TARGET,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(WebsitePublisher.toApiPayload(post, published)),
      fetchImpl: this.fetchImpl,
    });

    return this.urlFor(post.frontmatter.slug);
  }

  async delete(slug: string): Promise<void> {
    assertValidSlug(slug);
    await requestJson(`${this.endpoint}/${slug}`, {
      target: TARGET,
      method: 'DELETE',
      headers: this.headers(),
      fetchImpl: this.fetchImpl,
    });
  }

  /** Fetch a post. Returns null when it doesn't exist. */
  async get(slug: string): Promise<BlogApiPost | null> {
    try {
      const { data } = await requestJson<BlogApiPost>(`${this.endpoint}/${slug}`, {
        target: TARGET,
        method: 'GET',
        headers: this.headers(),
        fetchImpl: this.fetchImpl,
      });
      return data;
    } catch (err) {
      if (err instanceof PublishError && err.status === 404) return null;
      throw err;
    }
  }

  urlFor(slug: string): string {
    return postUrl(this.config.baseUrl, slug, this.config.blogPath);
  }
}
