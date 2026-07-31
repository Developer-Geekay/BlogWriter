#!/usr/bin/env node
/**
 * One-off migration: read the Markdown posts the CLI used to write and insert
 * them into MongoDB, which is now the source of truth.
 *
 * Safe to re-run — a post whose slug already exists is skipped rather than
 * duplicated or overwritten, so an interrupted import can simply be repeated.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { PostRepository } from '../src/store/repository.js';
import { PostStore } from '../src/db/posts.js';
import { closeDb } from '../src/db/client.js';
import { Logger } from '../src/util/log.js';

const CONTENT_DIR = process.argv[2] ?? 'content/posts';

async function main() {
  const log = new Logger();

  if (!existsSync(CONTENT_DIR)) {
    log.error(`No such directory: ${CONTENT_DIR}`);
    log.info('Pass the path as an argument: npm run import-markdown -- path/to/posts');
    process.exitCode = 1;
    return;
  }

  const files = new PostRepository(CONTENT_DIR);
  const store = await PostStore.open();
  const slugs = await files.listSlugs();

  if (slugs.length === 0) {
    log.info(`No Markdown posts found in ${CONTENT_DIR}.`);
    await closeDb();
    return;
  }

  log.heading(`Importing ${slugs.length} post(s) from ${CONTENT_DIR}`);
  let imported = 0;
  let skipped = 0;

  for (const slug of slugs) {
    if (await store.findBySlug(slug)) {
      log.info(`  skip    ${slug} (already in the database)`);
      skipped++;
      continue;
    }

    const post = await files.read(slug);
    const fm = post.frontmatter;

    await store.create({
      title: fm.title,
      body: post.body,
      excerpt: fm.excerpt,
      slug: fm.slug,
      tags: fm.tags,
      coverImage: null,
      // The old store's "published" is the only state that should go live now.
      status: fm.status === 'published' ? 'published' : 'draft',
      sources: fm.sources.map((s) => ({ url: s.url, title: s.title })),
      unsupportedClaims: fm.unsupportedClaims,
    });

    log.success(`${slug}`);
    imported++;
  }

  log.info('');
  log.info(`Imported ${imported}, skipped ${skipped}.`);
  await closeDb();
}

main().catch(async (err) => {
  new Logger().error((err as Error).message);
  await closeDb().catch(() => {});
  process.exit(1);
});
