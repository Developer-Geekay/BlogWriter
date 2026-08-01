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

type AnalyticsSdk = {
  init(options: { siteId: string; endpoint: string }): void;
  trackVisit(path: string, payload?: Record<string, unknown>): void;
};

declare global {
  interface Window {
    AnalyticsSDK?: AnalyticsSdk;
  }
}

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

    if (!initialised.current) {
      // The script tag already carries the tenant, but the SDK's documented
      // contract for manual tracking is to init first. Doing it explicitly
      // costs nothing and removes the ambiguity.
      sdk.init({ siteId: config.siteId, endpoint: config.endpoint });
      initialised.current = true;
    }

    pending.current = null;
    sdk.trackVisit(path);
  }, [config.siteId, config.endpoint]);

  useEffect(() => {
    if (!isTrackablePath(pathname)) return;
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
      // component reports — and it would record admin routes we exclude.
      data-auto-track="false"
      strategy="afterInteractive"
      onReady={flush}
    />
  );
}

/**
 * Loads the analytics SDK and reports one visit per router navigation.
 *
 * Renders nothing when `NEXT_PUBLIC_ANALYTICS_HOST` is unset, which is the
 * default for local development and for anyone running this without an
 * analytics server.
 */
export function Analytics() {
  const config = resolveAnalytics(analyticsEnv);
  if (!config) return null;

  // `useSearchParams` opts a subtree out of static rendering unless it sits
  // behind a Suspense boundary; without one, every page using this layout
  // would be forced dynamic.
  return (
    <Suspense fallback={null}>
      <AnalyticsTracker config={config} />
    </Suspense>
  );
}
