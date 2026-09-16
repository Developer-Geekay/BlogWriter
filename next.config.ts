import type { NextConfig } from 'next';

/**
 * Shared code under `src/` is bundled by Next *and* run directly by the CLI
 * under Node ESM, where relative imports must carry a `.js` extension. Neither
 * bundler remaps those to the `.ts` sources on its own, so both are told to.
 */
const extensionAlias = {
  '.js': ['.ts', '.tsx', '.js'],
  '.mjs': ['.mts', '.mjs'],
};

const nextConfig: NextConfig = {
  // Emit a self-contained server with only the modules actually reached, which
  // is what `scripts/after_prepare.mjs` packages into `release/`. It is two
  // orders of magnitude smaller than shipping `node_modules` wholesale.
  //
  // Note this is why `npm start` runs `release/server.js` rather than
  // `next start`: Next refuses to run `next start` against a standalone build.
  output: 'standalone',

  // Server-only, and the first two are native. Bundling sharp breaks it — its
  // platform binaries have to be resolved from node_modules at runtime, which
  // is also how the standalone trace picks them up for `release/`.
  serverExternalPackages: ['mongodb', 'bcryptjs', 'sharp'],

  /**
   * Entries moved from /blog/:slug to /entry/:slug.
   *
   * Permanent, so search engines transfer the ranking rather than treating the
   * new path as a duplicate, and so anything already shared keeps resolving.
   *
   * A redirect rather than a second route: /blog/ no longer serves anything, it
   * only points at where the entry actually lives. One canonical URL per entry.
   */
  async redirects() {
    return [
      { source: '/blog/:slug', destination: '/entry/:slug', permanent: true },
      // There was never a /blog index, but anyone who trims the slug off a old
      // link should land on the feed rather than a 404.
      { source: '/blog', destination: '/', permanent: true },
    ];
  },

  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },

  webpack: (config) => {
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ...extensionAlias };
    return config;
  },
};

export default nextConfig;
