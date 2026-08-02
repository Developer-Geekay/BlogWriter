/**
 * Post-build release packaging.
 *
 * Turns a finished `next build` into `release/` — a self-contained directory
 * that runs with `node server.js` and nothing else installed. Copy it to the
 * server, set the environment, start it.
 *
 * Next's standalone output does the dependency pruning that a hand-written
 * package list would otherwise have to: it traces the modules actually reached
 * from the server entry and copies only those, so build-only packages
 * (typescript, tailwind, vitest, tsx) never reach the artifact. What it does
 * *not* do is copy static assets or fix up the package manifest, which is most
 * of what happens below.
 *
 * Runs automatically after `npm run build` via the `postbuild` lifecycle hook.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const staticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');
const packageJsonFile = path.join(rootDir, 'package.json');
const releaseDir = path.join(rootDir, 'release');

console.log('🚀 Executing post-build release packaging (after_prepare.mjs)...');

/** Human-readable size of a directory, for the summary line. */
function directorySize(dir) {
  try {
    return execFileSync('du', ['-sh', dir], { encoding: 'utf8' }).split('\t')[0].trim();
  } catch {
    return 'unknown size';
  }
}

/**
 * Which analytics tenant got baked in.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so the artifact carries
 * whatever was in the environment a moment ago. Printing it here is the only
 * cheap moment to notice that a release was built with analytics off, or
 * against the wrong tenant — after this it is buried in a minified chunk.
 */
function analyticsSummary() {
  const explicit = process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID;
  const production = process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID_PRODUCTION;
  const development = process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID_DEVELOPMENT;
  const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV;

  const tenant = explicit || (isProduction ? production : development);
  if (!tenant) {
    return '⚠️  Analytics: no tenant in the build environment — this release tracks nothing.';
  }

  const which = explicit ? 'explicit' : isProduction ? 'production' : 'development';
  return `📊 Analytics: baked in the ${which} tenant (…${tenant.slice(-12)}).`;
}

try {
  // 1. The build has to have run, and it has to have been a standalone one.
  if (!existsSync(standaloneDir)) {
    throw new Error(
      `.next/standalone not found — run "npm run build" first.\n` +
        `   If the build did run, check that next.config.ts still sets output: 'standalone'.`,
    );
  }

  // 2. Re-create a clean release directory. Packaging on top of an old release
  //    would leave deleted files behind and quietly ship them.
  if (existsSync(releaseDir)) {
    rmSync(releaseDir, { recursive: true, force: true });
    console.log('🧹 Cleaned existing release directory.');
  }
  mkdirSync(releaseDir, { recursive: true });

  // 3. Copy the traced server — server.js, its pruned node_modules, and the
  //    compiled app — into release/ (FLATTENED).
  cpSync(standaloneDir, releaseDir, { recursive: true });
  console.log('📦 Copied .next/standalone directly into release/ root');

  // 4. Copy the client bundles and CSS -> release/.next/static
  //    Next deliberately leaves these out of standalone; without them every
  //    page renders unstyled and un-hydrated, which is a confusing failure
  //    because the HTML itself is served fine.
  if (existsSync(staticDir)) {
    const releaseStatic = path.join(releaseDir, '.next', 'static');
    mkdirSync(releaseStatic, { recursive: true });
    cpSync(staticDir, releaseStatic, { recursive: true });
    console.log('📦 Copied .next/static -> release/.next/static');
  } else {
    console.warn('⚠️ Warning: .next/static not found — the site would render unstyled.');
  }

  // 5. Copy public static assets -> release/public
  if (existsSync(publicDir)) {
    const releasePublic = path.join(releaseDir, 'public');
    mkdirSync(releasePublic, { recursive: true });
    cpSync(publicDir, releasePublic, { recursive: true });
    console.log('📦 Copied public static assets -> release/public');
  }

  // 6. Rewrite the manifest Next copied over.
  //
  //    It arrives as this repository's full package.json, which is wrong in two
  //    ways inside a release: `npm start` would run `next start`, which refuses
  //    to serve a standalone build, and the dependency lists invite an
  //    `npm ci` that would delete the pruned node_modules and reinstall 700 MB
  //    of the wrong thing. Neither field survives.
  const source = JSON.parse(readFileSync(packageJsonFile, 'utf8'));
  const manifest = {
    name: source.name,
    version: source.version,
    private: true,
    type: source.type,
    engines: source.engines,
    scripts: { start: 'node server.js' },
  };
  writeFileSync(
    path.join(releaseDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log('📝 Rewrote release/package.json (start = node server.js, no install step)');

  // 7. A note that travels with the artifact. The instructions matter most to
  //    whoever unpacks this on a server, who will not have this output.
  writeFileSync(
    path.join(releaseDir, 'HOW-TO-RUN.md'),
    `# Release package

Built by \`scripts/after_prepare.mjs\` from a \`next build\`. Self-contained:
everything needed to serve the site is already here.

\`\`\`bash
PORT=3000 node server.js
\`\`\`

**Do not run \`npm install\` or \`npm ci\` in this directory.** \`node_modules\` is
already here, pruned to the modules the server actually reaches. Installing
would replace it with the full dependency tree.

Runtime environment (\`MONGODB_URI\`, \`SESSION_SECRET\`, \`SITE_URL\`) is read at
startup, so it can be set here. \`NEXT_PUBLIC_*\` values are **not** — they were
inlined when this package was built, and changing one means rebuilding.

Admin CLI commands (\`create-admin\`, \`status\`, \`import-markdown\`) are not part
of this package; they run through \`tsx\` from a full checkout. They only talk
to MongoDB, so run them from the build machine pointed at the same
\`MONGODB_URI\`.
`,
  );
  console.log('📝 Wrote release/HOW-TO-RUN.md');

  console.log(analyticsSummary());
  console.log(
    `✨ Deployment release package created in "/release" (${directorySize(releaseDir)}) — run it with: node release/server.js`,
  );
} catch (error) {
  console.error('❌ Error during release packaging:', error.message);
  process.exit(1);
}
