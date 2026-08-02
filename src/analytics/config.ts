/**
 * Configuration for the external analytics platform.
 *
 * The host is fixed — there is one analytics server and it is not going to
 * move. The tenant ("site ID") is not: it is deployment-specific, so it comes
 * from the environment and is deliberately absent from this file. Production
 * and development report under different tenants, and burying either UUID in
 * source would mean a code change to move a deployment between them.
 */

/** The analytics server. Overridable, but there is only one in practice. */
export const DEFAULT_ANALYTICS_HOST = 'https://analytics.consoleapi.in';

export type AnalyticsConfig = {
  /** Origin of the analytics server. */
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
  productionSiteId?: string;
  developmentSiteId?: string;
  nodeEnv?: string;
};

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

/**
 * Pick the tenant this build reports under.
 *
 * `NEXT_PUBLIC_ANALYTICS_SITE_ID` is the single-value form: set it and that is
 * the tenant, whatever the environment. The `_PRODUCTION` / `_DEVELOPMENT` pair
 * exists so one `.env` can hold both UUIDs and still be safe — a production
 * build reports production, `npm run dev` reports development, with no risk of
 * local page loads landing in the real numbers because someone forgot to swap a
 * value.
 */
function pickSiteId(env: AnalyticsEnv): string {
  const explicit = clean(env.siteId);
  if (explicit) return explicit;

  return env.nodeEnv === 'production'
    ? clean(env.productionSiteId)
    : clean(env.developmentSiteId);
}

/**
 * Resolve the analytics configuration, or `null` when tracking should be off.
 *
 * No tenant means no tracking. There is nothing sensible to fall back to — a
 * guessed UUID would either be rejected or, worse, pollute someone else's
 * tenant — and it keeps a fresh clone silent until it is configured on purpose.
 */
export function resolveAnalytics(env: AnalyticsEnv): AnalyticsConfig | null {
  const siteId = pickSiteId(env);
  if (!siteId) return null;

  const host = (clean(env.host) || DEFAULT_ANALYTICS_HOST).replace(/\/+$/, '');

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
  productionSiteId: process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID_PRODUCTION,
  developmentSiteId: process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID_DEVELOPMENT,
  nodeEnv: process.env.NODE_ENV,
};
