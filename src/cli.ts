#!/usr/bin/env node
import 'dotenv/config';
import open from 'open';
import { Command } from 'commander';
import { loadConfig, ConfigError, requireEnv } from './config/load.js';
import { PostStore } from './db/posts.js';
import { SettingsStore } from './db/settings.js';
import { UserStore } from './db/users.js';
import { closeDb, DatabaseError } from './db/client.js';
import { serveStdio } from './mcp/transport.js';
import { runAuthFlow } from './publishers/linkedin-auth.js';
import { Logger } from './util/log.js';

const program = new Command();

program
  .name('blog')
  .description('Operational commands for the blog portal')
  .version('1.0.0');

/**
 * Local MCP over stdio, backed by the same database the portal uses.
 *
 * Remote clients should use the portal's `/api/mcp` endpoint instead, which
 * respects the enable/disable toggle. This command is for a client running on
 * the same machine, so it is not gated by that switch — but it does honour the
 * "allow publish" setting.
 */
program
  .command('mcp')
  .description('Serve MCP over stdio for a locally launched AI client')
  .option('--allow-publish', 'override the portal setting and allow publishing', false)
  .action(async (opts: { allowPublish: boolean }) => {
    const settings = await (await SettingsStore.open()).get();

    // Voice guide is optional — without config/profile.yml the tool is skipped.
    let profile;
    let topics;
    try {
      const config = await loadConfig();
      ({ profile, topics } = config);
    } catch {
      /* no voice guide available */
    }

    await serveStdio({
      posts: await PostStore.open(),
      ...(profile ? { profile } : {}),
      ...(topics ? { topics } : {}),
      allowPublish: opts.allowPublish || settings.mcpAllowPublish,
      ...(process.env['SITE_URL'] ? { siteUrl: process.env['SITE_URL'] } : {}),
    });
  });

program
  .command('create-admin')
  .description('Create the admin account used to sign in to the portal')
  .requiredOption('-e, --email <email>', 'sign-in email')
  .requiredOption('-p, --password <password>', 'password (at least 12 characters)')
  .option('-n, --name <name>', 'display name', 'Admin')
  .action(async (opts: { email: string; password: string; name: string }) => {
    const log = new Logger();
    if (opts.password.length < 12) {
      log.error('Choose a password of at least 12 characters.');
      process.exitCode = 1;
      return;
    }

    const users = await UserStore.open();
    if (await users.findByEmail(opts.email)) {
      log.error(`An account already exists for ${opts.email}.`);
      process.exitCode = 1;
      return;
    }

    const user = await users.create(opts);
    log.success(`Created admin ${user.email}. Sign in at /admin/login`);
    await closeDb();
  });

program
  .command('status')
  .description('Show what is in the database and whether MCP is enabled')
  .action(async () => {
    const log = new Logger();
    const [posts, settings, users] = await Promise.all([
      PostStore.open(),
      SettingsStore.open().then((s) => s.get()),
      UserStore.open().then((s) => s.count()),
    ]);

    const [published, drafts, archived] = await Promise.all([
      posts.count({ status: 'published' }),
      posts.count({ status: 'draft' }),
      posts.count({ status: 'archived' }),
    ]);

    log.heading('Gokulakannan');
    log.info(`  admins      ${users}`);
    log.info(`  published   ${published}`);
    log.info(`  drafts      ${drafts}`);
    log.info(`  archived    ${archived}`);
    log.info(`  mcp         ${settings.mcpEnabled ? 'enabled' : 'disabled'}`);
    if (settings.mcpEnabled) {
      log.info(`  mcp token   ${settings.mcpToken ? 'set' : 'MISSING'}`);
      log.info(`  mcp publish ${settings.mcpAllowPublish ? 'allowed' : 'blocked'}`);
    }
    await closeDb();
  });

program
  .command('linkedin:auth')
  .description('Run the OAuth flow to mint LinkedIn credentials')
  .action(async () => {
    const log = new Logger();
    const clientId = requireEnv('LINKEDIN_CLIENT_ID');
    const clientSecret = requireEnv('LINKEDIN_CLIENT_SECRET');

    log.heading('LinkedIn OAuth');
    const result = await runAuthFlow({
      clientId,
      clientSecret,
      port: 3000,
      openUrl: (url) => {
        log.info(`→ Opening ${url}`);
        open(url).catch(() => log.warn('Could not open a browser; paste the URL above.'));
      },
    });

    log.success('Authorized.');
    log.info(`LINKEDIN_ACCESS_TOKEN=${result.accessToken}`);
    log.info(`LINKEDIN_PERSON_URN=${result.personUrn}`);
    log.info(`Token expires: ${result.expiresAt}`);
  });

program.parseAsync(process.argv).catch(async (err: unknown) => {
  const log = new Logger();
  if (err instanceof ConfigError || err instanceof DatabaseError) {
    log.error(err.message);
  } else {
    log.error((err as Error).message ?? String(err));
    if (process.env['DEBUG']) console.error(err);
  }
  await closeDb().catch(() => {});
  process.exit(1);
});
