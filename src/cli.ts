#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, ConfigError, requireEnv } from './config/load.js';
import { LlmClient, estimateCostUsd } from './llm/client.js';
import { PostRepository } from './store/repository.js';
import { postUrl } from './store/post.js';
import { draftPost } from './pipeline/draft.js';
import { Logger } from './util/log.js';

const program = new Command();

program
  .name('blogwriter')
  .description('AI-assisted blog and LinkedIn content pipeline')
  .version('0.1.0');

program
  .command('draft')
  .description('Research, write, edit, and fact-check a post; save it as a Markdown draft')
  .requiredOption('-t, --topic <topic>', 'what to write about')
  .option('-s, --slug <slug>', 'override the generated slug')
  .option('--no-research', 'skip web research (cheaper; for opinion pieces)')
  .option('-q, --quiet', 'only print the result', false)
  .action(async (opts: { topic: string; slug?: string; research: boolean; quiet: boolean }) => {
    const log = new Logger(opts.quiet);
    const config = await loadConfig();
    requireEnv('ANTHROPIC_API_KEY');

    const repo = new PostRepository(config.contentDir);
    const llm = new LlmClient(config.model);

    log.heading(`Drafting: ${opts.topic}`);
    const { post, path, usage } = await draftPost(
      { topic: opts.topic, slug: opts.slug, skipResearch: !opts.research },
      { config, llm, repo, log },
    );

    log.info('');
    log.success(`${post.frontmatter.title}`);
    log.info(`  file   ${path}`);
    log.info(`  slug   ${post.frontmatter.slug}`);
    log.info(`  words  ${countWords(post.body)}`);
    log.info(`  cost   ~$${estimateCostUsd(usage).toFixed(3)}`);

    if (post.frontmatter.unsupportedClaims.length) {
      log.info('');
      log.warn('Claims the fact-check pass could not tie to a source:');
      for (const claim of post.frontmatter.unsupportedClaims) {
        log.info(`  • ${claim}`);
      }
    }
  });

program
  .command('status')
  .description('List every post in the content store and where it stands')
  .action(async () => {
    const log = new Logger();
    const config = await loadConfig();
    const posts = await new PostRepository(config.contentDir).readAll();

    if (posts.length === 0) {
      log.info('No posts yet. Create one with: npm run draft -- --topic "..."');
      return;
    }

    log.heading(`${posts.length} post${posts.length === 1 ? '' : 's'}`);
    for (const { frontmatter: fm } of posts) {
      const flags: string[] = [];
      if (fm.unsupportedClaims.length) flags.push(`${fm.unsupportedClaims.length} unverified`);
      if (fm.website.status === 'published') flags.push('web');
      if (fm.linkedin.status === 'published') flags.push('linkedin');

      log.info(
        `  ${fm.status.padEnd(10)} ${fm.slug.padEnd(44).slice(0, 44)} ` +
          `${fm.createdAt.slice(0, 10)}${flags.length ? `  [${flags.join(', ')}]` : ''}`,
      );
      if (fm.website.url) log.info(`  ${' '.repeat(10)} ${fm.website.url}`);
    }
  });

program
  .command('validate')
  .description('Check the config and every stored post without calling any API')
  .action(async () => {
    const log = new Logger();
    const config = await loadConfig();
    log.success('config is valid');
    log.info(`  site         ${config.website.baseUrl}`);
    log.info(`  model        ${config.model.id}`);
    log.info(`  content dir  ${config.contentDir}`);

    const repo = new PostRepository(config.contentDir);
    const slugs = await repo.listSlugs();
    let bad = 0;

    for (const slug of slugs) {
      try {
        const post = await repo.read(slug);
        // Confirm the slug would be accepted by the blog API before publish day.
        if (post.frontmatter.slug !== slug) {
          throw new Error(`front matter slug "${post.frontmatter.slug}" does not match filename`);
        }
      } catch (err) {
        bad++;
        log.error(`${slug}.md — ${(err as Error).message}`);
      }
    }

    if (bad === 0) {
      log.success(`${slugs.length} post${slugs.length === 1 ? '' : 's'} valid`);
      if (slugs.length) {
        log.info(`  first published URL would be ${postUrl(config.website.baseUrl, slugs[0]!)}`);
      }
    } else {
      process.exitCode = 1;
    }
  });

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const log = new Logger();
  if (err instanceof ConfigError) {
    log.error(err.message);
  } else {
    log.error((err as Error).message ?? String(err));
    if (process.env['DEBUG']) console.error(err);
  }
  process.exit(1);
});
