'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import {
  analyticsEnv,
  isTrackablePath,
  resolveAnalytics,
  type AnalyticsConfig,
} from '@/src/analytics/config';

/**
 * The programmatic surface of ConsoleAPI's `analytics.js`.
 *
 * Both methods are optional on purpose. The platform's integration guide
 * documents the script tag as the supported standard and no longer describes
 * `init`/`trackVisit`, so a future build of the SDK could ship without them.
 * Treating them as guaranteed would turn that into a TypeError on every page.
 */
type AnalyticsSdk = {
  init?(options: { siteId: string; endpoint: string }): void;
  trackVisit?(path: string, payload?: Record<string, unknown>): void;
};

declare global {
  interface Window {
    AnalyticsSDK?: AnalyticsSdk;
  }
}

/** Logged once per page load; a warning per navigation would be noise. */
let missingApiReported = false;

/** Exported for tests; `Analytics` is what the app renders. */
export function AnalyticsTracker({ config }: { config: AnalyticsConfig }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The visit waiting to be reported. The SDK loads after hydration, so the
  // first navigation usually happens before `window.AnalyticsSDK` exists;
  // holding it here lets the script's ready callback pick it up instead of
  // losing the landing page — the one visit that matters most.
  const pending = useRef<string | null>(null);
  const initialised = useRef(false);

  const flush = useCallback(() => {
    const path = pending.current;
    if (path === null) return;

    const sdk = window.AnalyticsSDK;
    if (!sdk) return;

    if (typeof sdk.trackVisit !== 'function') {
      // The SDK loaded but has no programmatic API. Nothing is reported —
      // auto-tracking is off, and it cannot be switched on after load. Say so
      // rather than throwing on every navigation, and rather than going quiet.
      if (!missingApiReported) {
        missingApiReported = true;
        console.error(
          '[analytics] analytics.js exposes no trackVisit(); no visits are being ' +
            'reported. The SDK may have dropped its programmatic API — see ' +
            'components/Analytics.tsx.',
        );
      }
      pending.current = null;
      return;
    }

    if (!initialised.current) {
      // The script tag already carries the tenant, so this is belt and braces
      // for manual tracking rather than a requirement.
      sdk.init?.({ siteId: config.siteId, endpoint: config.endpoint });
      initialised.current = true;
    }

    pending.current = null;
    sdk.trackVisit(path);
  }, [config.siteId, config.endpoint]);

  useEffect(() => {
    const query = searchParams?.toString();
    pending.current = query ? `${pathname}?${query}` : pathname;
    flush();
  }, [pathname, searchParams, flush]);

  return (
    <Script
      src={config.scriptUrl}
      data-site-id={config.siteId}
      data-host={config.host}
      // Auto-tracking is off on purpose. The SDK hooks `history.pushState`,
      // which the Next.js router also drives, so leaving it on would record a
      // second visit for every client-side navigation on top of the one this
      // component reports.
      data-auto-track="false"
      strategy="afterInteractive"
      onReady={flush}
    />
  );
}

/**
 * Loads the ConsoleAPI analytics SDK and reports one visit per router
 * navigation.
 *
 * Renders nothing — not even the script tag — when no tenant is configured, or
 * anywhere under `/admin`. Excluding the portal is not only about keeping the
 * author's own sessions out of the numbers: `analytics.js` replaces the whole
 * document body with a blocking overlay when the platform decides a visitor's
 * IP is a threat, and the tool used to run the site is the last place that
 * should be able to happen.
 */
export function Analytics() {
  const config = resolveAnalytics(analyticsEnv);
  if (!config) return null;

  // `useSearchParams` opts a subtree out of static rendering unless it sits
  // behind a Suspense boundary; without one, every page using this layout
  // would be forced dynamic.
  return (
    <Suspense fallback={null}>
      <AnalyticsGate config={config} />
    </Suspense>
  );
}

/** Exported for tests. */
export function AnalyticsGate({ config }: { config: AnalyticsConfig }) {
  const pathname = usePathname();
  if (!isTrackablePath(pathname)) return null;
  return <AnalyticsTracker config={config} />;
}
