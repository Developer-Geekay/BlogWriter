import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { ulid } from 'ulid';
import { FrontmatterSchema, type Frontmatter, type Post, type PostStatus, assertTransition } from './post.js';
import { assertValidSlug, slugify, uniqueSlug } from './slug.js';

/**
 * The content store. Git is the database: every post is one Markdown file with
 * YAML front matter, so a draft is reviewable as a diff and the publish history
 * is the commit history.
 */
export class PostRepository {
  constructor(private readonly dir: string) {}

  private pathFor(slug: string): string {
    return path.join(this.dir, `${slug}.md`);
  }

  async listSlugs(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    const entries = await readdir(this.dir);
    return entries.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  }

  async exists(slug: string): Promise<boolean> {
    return existsSync(this.pathFor(slug));
  }

  async read(slug: string): Promise<Post> {
    const raw = await readFile(this.pathFor(slug), 'utf8');
    return parsePost(raw, slug);
  }

  async readAll(): Promise<Post[]> {
    const slugs = await this.listSlugs();
    const posts = await Promise.all(slugs.map((s) => this.read(s)));
    // Newest first, matching how the blog API lists them.
    return posts.sort((a, b) => b.frontmatter.createdAt.localeCompare(a.frontmatter.createdAt));
  }

  async write(post: Post): Promise<string> {
    assertValidSlug(post.frontmatter.slug);
    await mkdir(this.dir, { recursive: true });

    const frontmatter: Frontmatter = {
      ...post.frontmatter,
      updatedAt: new Date().toISOString(),
    };

    const file = this.pathFor(frontmatter.slug);
    await writeFile(file, serializePost({ frontmatter, body: post.body }), 'utf8');
    return file;
  }

  /** Read, apply a change, and write back — with the status transition checked. */
  async update(slug: string, mutate: (post: Post) => Post): Promise<Post> {
    const before = await this.read(slug);
    const after = mutate(structuredClone(before));

    if (after.frontmatter.status !== before.frontmatter.status) {
      assertTransition(before.frontmatter.status, after.frontmatter.status);
    }

    await this.write(after);
    return after;
  }

  /**
   * Allocate a slug for a new post, avoiding collisions with anything already
   * in the store.
   */
  async allocateSlug(title: string, preferred?: string): Promise<string> {
    const desired = preferred ? preferred : slugify(title);
    assertValidSlug(desired);
    return uniqueSlug(desired, await this.listSlugs());
  }
}

export function newFrontmatter(input: {
  slug: string;
  title: string;
  topic?: string;
  status?: PostStatus;
}): Frontmatter {
  const now = new Date();
  return FrontmatterSchema.parse({
    id: ulid(),
    slug: input.slug,
    title: input.title,
    status: input.status ?? 'drafted',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    publishDate: now.toISOString().slice(0, 10),
    topic: input.topic ?? '',
  });
}

export function parsePost(raw: string, slugHint?: string): Post {
  const parsed = matter(raw);
  const result = FrontmatterSchema.safeParse(parsed.data);

  if (!result.success) {
    const where = slugHint ? ` in "${slugHint}.md"` : '';
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid front matter${where}:\n${issues}`);
  }

  return { frontmatter: result.data, body: parsed.content.trim() };
}

export function serializePost(post: Post): string {
  // gray-matter round-trips through js-yaml; passing a plain object keeps the
  // key order we define in the schema rather than alphabetising it.
  return matter.stringify(`\n${post.body.trim()}\n`, post.frontmatter, {
    lineWidth: 0,
  } as Record<string, unknown>);
}
