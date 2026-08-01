/**
 * Configuration for the external analytics platform.
 *
 * The platform is multi-tenant: every deployment reports under a tenant UUID
 * ("site ID"), and the numbers are only meaningful if the production site and a
 * developer's laptop report under different ones. So the tenant is picked from
 * the build environment rather than hard-wired to a single value.
 */

/** Tenant UUIDs issued by the analytics platform for this blog. */
export const SITE_IDS = {
  production: 'cd6dae88-d6b4-4f4a-9624-4fa263b66438',
  development: '237c8104-412c-4f8b-a506-a50965c796df',
} as const;

export type AnalyticsConfig = {
  /** Origin of the analytics server, e.g. https://analytics.example.com */
  host: string;
  /** Tenant UUID this deployment reports under. */
  siteId: string;
  /** Full URL of the beacon ingestion endpoint. */
  endpoint: string;
  /** URL of the SDK bundle to load. */
  scriptUrl: string;
};

export type AnalyticsEnv = {
  host?: string;
  siteId?: string;
  nodeEnv?: string;
};

/**
 * Resolve the analytics configuration, or `null` when tracking should be off.
 *
 * The host has no sensible default — pointing beacons at a guessed origin would
 * either leak reader paths to a stranger's server or silently fail — so an
 * unset `NEXT_PUBLIC_ANALYTICS_HOST` disables analytics entirely. That also
 * gives contributors a working local setup with no beacons by default.
 */
export function resolveAnalytics(env: AnalyticsEnv): AnalyticsConfig | null {
  const host = env.host?.trim().replace(/\/+$/, '');
  if (!host) return null;

  // An explicit override wins: a staging deployment can report under its own
  // tenant without needing a new branch in this function.
  const siteId =
    env.siteId?.trim() ||
    (env.nodeEnv === 'production' ? SITE_IDS.production : SITE_IDS.development);

  return {
    host,
    siteId,
    endpoint: `${host}/api/analytics/visit`,
    scriptUrl: `${host}/sdk/analytics.js`,
  };
}

/**
 * The portal is not an audience.
 *
 * Admin traffic is one person editing their own site, and those URLs carry post
 * IDs, so tracking them would both inflate the numbers and scatter internal
 * identifiers through a third-party dataset.
 */
export function isTrackablePath(pathname: string): boolean {
  return !(pathname === '/admin' || pathname.startsWith('/admin/'));
}

/**
 * Build-time environment, read through static `process.env.X` members so the
 * Next.js bundler can inline them into the browser bundle. Anything dynamic
 * (indexing, destructuring `process.env`) is not substituted and would arrive
 * as `undefined` on the client.
 */
export const analyticsEnv: AnalyticsEnv = {
  host: process.env.NEXT_PUBLIC_ANALYTICS_HOST,
  siteId: process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID,
  nodeEnv: process.env.NODE_ENV,
};
