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

  // The Mongo driver and bcrypt are server-only; keep them out of client bundles.
  serverExternalPackages: ['mongodb', 'bcryptjs'],

  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },

  webpack: (config) => {
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ...extensionAlias };
    return config;
  },
};

export default nextConfig;
