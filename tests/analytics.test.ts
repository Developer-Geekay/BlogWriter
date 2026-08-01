import { describe, expect, it } from 'vitest';
import { SITE_IDS, isTrackablePath, resolveAnalytics } from '../src/analytics/config.js';

describe('resolveAnalytics', () => {
  it('is off when no host is configured', () => {
    expect(resolveAnalytics({})).toBeNull();
    expect(resolveAnalytics({ host: '   ' })).toBeNull();
  });

  it('reports under the production tenant in a production build', () => {
    const config = resolveAnalytics({
      host: 'https://analytics.example.com',
      nodeEnv: 'production',
    });
    expect(config?.siteId).toBe(SITE_IDS.production);
  });

  it('reports under the development tenant everywhere else', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      const config = resolveAnalytics({ host: 'https://analytics.example.com', nodeEnv });
      expect(config?.siteId).toBe(SITE_IDS.development);
    }
  });

  it('keeps the two tenants distinct', () => {
    expect(SITE_IDS.production).not.toBe(SITE_IDS.development);
  });

  it('lets an explicit site id override the environment', () => {
    const config = resolveAnalytics({
      host: 'https://analytics.example.com',
      siteId: 'staging-tenant',
      nodeEnv: 'production',
    });
    expect(config?.siteId).toBe('staging-tenant');
  });

  it('derives the endpoint and script url from the host', () => {
    const config = resolveAnalytics({ host: 'https://analytics.example.com' });
    expect(config?.endpoint).toBe('https://analytics.example.com/api/analytics/visit');
    expect(config?.scriptUrl).toBe('https://analytics.example.com/sdk/analytics.js');
  });

  it('tolerates a trailing slash on the host', () => {
    // Otherwise the beacon URL ends up with a doubled slash, which some
    // reverse proxies redirect and sendBeacon will not follow.
    const config = resolveAnalytics({ host: 'https://analytics.example.com/' });
    expect(config?.endpoint).toBe('https://analytics.example.com/api/analytics/visit');
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
