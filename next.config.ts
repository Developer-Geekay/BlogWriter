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
