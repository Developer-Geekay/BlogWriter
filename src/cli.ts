#!/usr/bin/env node
import open from 'open';
import { Command } from 'commander';
import { loadConfig, ConfigError, requireEnv } from './config/load.js';
import { LlmClient, estimateCostUsd } from './llm/client.js';
import { PostRepository } from './store/repository.js';
import { postUrl } from './store/post.js';
import { draftPost } from './pipeline/draft.js';
import { publishPost } from './pipeline/publish.js';
import { serveHttp, serveStdio } from './mcp/transport.js';
import { runAuthFlow } from './publishers/linkedin-auth.js';
import { LinkedInPublisher } from './publishers/linkedin.js';
import { WebsitePublisher } from './publishers/website.js';
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
  .command('linkedin:auth')
  .description('Run the OAuth flow to mint LinkedIn credentials and save them to .env')
  .action(async () => {
    const log = new Logger();
    const config = await loadConfig();

    const clientId = requireEnv('LINKEDIN_CLIENT_ID');
    const clientSecret = requireEnv('LINKEDIN_CLIENT_SECRET');

    log.heading('LinkedIn OAuth Flow');
    log.info('1. A browser window will open to LinkedIn authorization');
    log.info('2. Sign in and approve the app');
    log.info('3. You will be redirected to localhost (this script listens there)');
    log.info('');

    try {
      const result = await runAuthFlow({
        clientId,
        clientSecret,
        port: 3000,
        openUrl: (url: string) => {
          log.info(`→ Opening browser to: ${url}`);
          open(url).catch(() => {
            log.warn('Could not auto-open browser. Copy the URL above and open it manually.');
          });
        },
      });

      log.success('✓ Authorization successful');
      log.info('');
      log.info('Add the following to your .env file:');
      log.info(`LINKEDIN_ACCESS_TOKEN=${result.accessToken}`);
      log.info(`LINKEDIN_PERSON_URN=${result.personUrn}`);
      log.info('');
      if (result.name) {
        log.info(`Authorized as: ${result.name}`);
      }
      log.info(`Token expires: ${result.expiresAt}`);
      if (result.refreshToken) {
        log.info(`Refresh token: ${result.refreshToken}`);
      }
    } catch (err) {
      log.error(`Authorization failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('publish')
  .description('Publish an approved post to the website and LinkedIn')
  .requiredOption('-s, --slug <slug>', 'the post slug to publish')
  .option('--no-linkedin', 'skip LinkedIn publishing (only post to website)')
  .option('-q, --quiet', 'only print the result', false)
  .action(async (opts: { slug: string; linkedin: boolean; quiet: boolean }) => {
    const log = new Logger(opts.quiet);
    const config = await loadConfig();
    requireEnv('ANTHROPIC_API_KEY');

    const repo = new PostRepository(config.contentDir);
    const post = await repo.read(opts.slug);

    if (post.frontmatter.status !== 'approved') {
      log.error(`Cannot publish post with status "${post.frontmatter.status}". It must be approved.`);
      process.exit(1);
    }

    const llm = new LlmClient(config.model);
    const websitePublisher = new WebsitePublisher(config.website, requireEnv('WEBSITE_API_TOKEN'));

    let linkedinPublisher: LinkedInPublisher | undefined;
    if (opts.linkedin) {
      const accessToken = requireEnv(config.linkedin.tokenEnv);
      const personUrn = requireEnv(config.linkedin.personUrnEnv);
      linkedinPublisher = new LinkedInPublisher(config.linkedin, {
        accessToken,
        personUrn,
      });
    }

    try {
      const { websiteUrl, linkedinPostUrn, usage } = await publishPost(post, {
        config,
        llm,
        repo,
        log,
        websitePublisher,
        linkedinPublisher,
        skipLinkedIn: !opts.linkedin,
      });

      log.info('');
      log.success('Published successfully');
      log.info(`  website  ${websiteUrl}`);
      if (linkedinPostUrn) {
        log.info(`  linkedin ${linkedinPostUrn}`);
      }
      if (usage.inputTokens) {
        log.info(`  cost     ~$${estimateCostUsd(usage).toFixed(3)}`);
      }
    } catch (err) {
      log.error(`Publishing failed: ${(err as Error).message}`);
      if (process.env['DEBUG']) console.error(err);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Run the MCP server so other AI clients can draft and publish posts')
  .option('--http', 'serve over Streamable HTTP instead of stdio', false)
  .option('-p, --port <port>', 'HTTP port', '8848')
  .option(
    '-H, --host <host>',
    'HTTP bind address; a non-loopback address requires MCP_AUTH_TOKEN',
    '127.0.0.1',
  )
  .option('--allow-publish', 'expose publish_post (posts publicly, including LinkedIn)', false)
  .option('--allow-drafting', 'expose draft_post (spends Anthropic API credit)', false)
  .action(
    async (opts: {
      http: boolean;
      port: string;
      host: string;
      allowPublish: boolean;
      allowDrafting: boolean;
    }) => {
      const config = await loadConfig();
      const serverOptions = {
        config,
        allowPublish: opts.allowPublish,
        allowDrafting: opts.allowDrafting,
      };

      if (!opts.http) {
        // stdout is the protocol channel from here on — do not print to it.
        await serveStdio(serverOptions);
        return;
      }

      // Progress goes to stderr so it never competes with a piped stdout.
      const log = new Logger(false, process.stderr);
      const port = Number.parseInt(opts.port, 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        log.error(`Invalid port "${opts.port}".`);
        process.exit(1);
      }

      const authToken = process.env['MCP_AUTH_TOKEN'];
      const close = await serveHttp({
        ...serverOptions,
        port,
        host: opts.host,
        ...(authToken ? { authToken } : {}),
        allowedHosts: [`${opts.host}:${port}`, opts.host],
        onListening: (url) => {
          log.success(`MCP server listening on ${url}`);
          log.info(`  auth     ${authToken ? 'bearer token required' : 'none (loopback only)'}`);
          log.info(`  publish  ${opts.allowPublish ? 'enabled' : 'disabled'}`);
          log.info(`  drafting ${opts.allowDrafting ? 'enabled' : 'disabled'}`);
        },
      });

      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          void close().then(() => process.exit(0));
        });
      }
    },
  );

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
