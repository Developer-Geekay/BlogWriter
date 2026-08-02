import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYTICS_HOST,
  isTrackablePath,
  resolveAnalytics,
} from '../src/analytics/config.js';

const TENANTS = {
  production: 'production-tenant-uuid',
  development: 'development-tenant-uuid',
};

describe('resolveAnalytics', () => {
  it('is off when no tenant is configured', () => {
    expect(resolveAnalytics({})).toBeNull();
    expect(resolveAnalytics({ nodeEnv: 'production' })).toBeNull();
    expect(resolveAnalytics({ siteId: '   ' })).toBeNull();
  });

  it('is off when only the other environment has a tenant', () => {
    // A production build must not quietly borrow the development tenant.
    expect(
      resolveAnalytics({ developmentSiteId: TENANTS.development, nodeEnv: 'production' }),
    ).toBeNull();
    expect(
      resolveAnalytics({ productionSiteId: TENANTS.production, nodeEnv: 'development' }),
    ).toBeNull();
  });

  it('picks the tenant matching the build environment', () => {
    const env = {
      productionSiteId: TENANTS.production,
      developmentSiteId: TENANTS.development,
    };

    expect(resolveAnalytics({ ...env, nodeEnv: 'production' })?.siteId).toBe(
      TENANTS.production,
    );
    for (const nodeEnv of ['development', 'test', undefined]) {
      expect(resolveAnalytics({ ...env, nodeEnv })?.siteId).toBe(TENANTS.development);
    }
  });

  it('lets a single explicit site id override the pair', () => {
    const config = resolveAnalytics({
      siteId: 'staging-tenant',
      productionSiteId: TENANTS.production,
      developmentSiteId: TENANTS.development,
      nodeEnv: 'production',
    });
    expect(config?.siteId).toBe('staging-tenant');
  });

  it('falls back to the fixed analytics host', () => {
    const config = resolveAnalytics({ siteId: 'tenant' });
    expect(config?.host).toBe(DEFAULT_ANALYTICS_HOST);
    expect(config?.endpoint).toBe(`${DEFAULT_ANALYTICS_HOST}/api/analytics/visit`);
    expect(config?.scriptUrl).toBe(`${DEFAULT_ANALYTICS_HOST}/sdk/analytics.js`);
  });

  it('accepts a host override', () => {
    const config = resolveAnalytics({ siteId: 'tenant', host: 'https://staging.example.com' });
    expect(config?.endpoint).toBe('https://staging.example.com/api/analytics/visit');
  });

  it('tolerates a trailing slash on the host', () => {
    // Otherwise the beacon URL ends up with a doubled slash, which some
    // reverse proxies redirect and sendBeacon will not follow.
    const config = resolveAnalytics({ siteId: 'tenant', host: 'https://staging.example.com/' });
    expect(config?.endpoint).toBe('https://staging.example.com/api/analytics/visit');
  });

  it('does not carry a tenant id in source', async () => {
    // The whole point of the environment lookup: a UUID in this file would be a
    // deployment detail baked into the repository.
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../src/analytics/config.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('isTrackablePath', () => {
  it('tracks reader-facing pages', () => {
    for (const path of ['/', '/blog/some-post', '/search', '/tag/testing']) {
      expect(isTrackablePath(path)).toBe(true);
    }
  });

  it('skips the admin portal', () => {
    for (const path of ['/admin', '/admin/', '/admin/login', '/admin/posts/abc123/edit']) {
      expect(isTrackablePath(path)).toBe(false);
    }
  });

  it('does not skip a public path that merely starts with the same letters', () => {
    expect(isTrackablePath('/administrivia')).toBe(true);
  });
});
