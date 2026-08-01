// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

/**
 * The router hooks are driven by hand so a "navigation" is just a re-render
 * with a different path — the same thing the Next.js router does.
 */
let currentPath = '/';
let currentQuery = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
  useSearchParams: () => currentQuery,
}));

/**
 * Stands in for `next/script`. The real one loads the SDK asynchronously and
 * then calls `onReady`; here the test decides when that happens by calling the
 * captured callback, which is the whole point — the landing-page visit is
 * queued before the SDK exists.
 */
let scriptProps: Record<string, unknown> = {};
vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => {
    scriptProps = props;
    return null;
  },
}));

const { AnalyticsTracker } = await import('../components/Analytics.js');

const config = {
  host: 'https://analytics.example.com',
  siteId: 'test-tenant',
  endpoint: 'https://analytics.example.com/api/analytics/visit',
  scriptUrl: 'https://analytics.example.com/sdk/analytics.js',
};

const trackVisit = vi.fn();
const init = vi.fn();

/** Make the SDK appear on `window`, as the loaded script would. */
function loadSdk() {
  window.AnalyticsSDK = { init, trackVisit };
}

function ready() {
  (scriptProps.onReady as () => void)();
}

beforeEach(() => {
  currentPath = '/';
  currentQuery = new URLSearchParams();
  scriptProps = {};
  trackVisit.mockClear();
  init.mockClear();
  delete window.AnalyticsSDK;
});

afterEach(cleanup);

describe('AnalyticsTracker', () => {
  it('configures the script tag with the tenant and no auto-tracking', () => {
    render(<AnalyticsTracker config={config} />);
    expect(scriptProps.src).toBe(config.scriptUrl);
    expect(scriptProps['data-site-id']).toBe('test-tenant');
    expect(scriptProps['data-host']).toBe(config.host);
    // Auto-tracking would double-count every client-side navigation, since the
    // SDK and the Next router both hook history.pushState.
    expect(scriptProps['data-auto-track']).toBe('false');
  });

  it('reports the landing page even though the SDK loads after render', () => {
    render(<AnalyticsTracker config={config} />);
    expect(trackVisit).not.toHaveBeenCalled();

    loadSdk();
    ready();

    expect(init).toHaveBeenCalledWith({ siteId: 'test-tenant', endpoint: config.endpoint });
    expect(trackVisit).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('reports once per navigation', () => {
    loadSdk();
    const { rerender } = render(<AnalyticsTracker config={config} />);
    ready();
    expect(trackVisit).toHaveBeenCalledTimes(1);

    currentPath = '/blog/hello';
    rerender(<AnalyticsTracker config={config} />);

    expect(trackVisit).toHaveBeenCalledTimes(2);
    expect(trackVisit).toHaveBeenLastCalledWith('/blog/hello');
    // One init for the lifetime of the page, not one per visit.
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('includes the query string', () => {
    loadSdk();
    currentPath = '/search';
    currentQuery = new URLSearchParams({ q: 'mongo db' });
    render(<AnalyticsTracker config={config} />);
    ready();
    expect(trackVisit).toHaveBeenLastCalledWith('/search?q=mongo+db');
  });

  it('does not report admin pages', () => {
    loadSdk();
    currentPath = '/admin/posts/abc/edit';
    const { rerender } = render(<AnalyticsTracker config={config} />);
    ready();
    expect(trackVisit).not.toHaveBeenCalled();

    // And leaving the portal reports the public page, not the admin one.
    currentPath = '/blog/hello';
    rerender(<AnalyticsTracker config={config} />);
    expect(trackVisit).toHaveBeenCalledExactlyOnceWith('/blog/hello');
  });

  it('survives a ready callback that fires with nothing queued', () => {
    loadSdk();
    render(<AnalyticsTracker config={config} />);
    ready();
    ready();
    expect(trackVisit).toHaveBeenCalledTimes(1);
  });
});
