'use client';

import { useEffect, useRef } from 'react';

/**
 * Reports one read of an entry, and whether the reader got to the end.
 *
 * Renders nothing. Two things keep the numbers meaningful rather than merely
 * large: the read is recorded once per entry per browser session, so a refresh
 * or a back-navigation does not inflate it, and the finish is only sent when
 * the end of the article actually enters the viewport.
 *
 * Failures are swallowed. A analytics beacon must never be the reason a reader
 * sees an error on a page that has already rendered perfectly well.
 */
export function ReadTracker({ slug }: { slug: string }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const readKey = `read:${slug}`;
    const finishKey = `finished:${slug}`;

    const send = (body: Record<string, unknown>) =>
      fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});

    let seen = false;
    try {
      seen = sessionStorage.getItem(readKey) === '1';
    } catch {
      // Private browsing can block storage. Falling through counts the read,
      // which is the better failure: under-counting is invisible, and this
      // still cannot loop because the page only mounts once.
    }

    if (!seen) {
      try {
        sessionStorage.setItem(readKey, '1');
      } catch {
        /* see above */
      }
      void send({ slug, referrer: document.referrer || undefined });
    }

    const end = endRef.current;
    if (!end) return;

    let finished = false;
    try {
      finished = sessionStorage.getItem(finishKey) === '1';
    } catch {
      /* see above */
    }
    if (finished) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        try {
          sessionStorage.setItem(finishKey, '1');
        } catch {
          /* see above */
        }
        void send({ slug, finished: true });
      },
      // A sliver of the sentinel is enough; requiring it fully on screen would
      // miss anyone who stops at the last line without scrolling past it.
      { threshold: 0.1 },
    );

    observer.observe(end);
    return () => observer.disconnect();
  }, [slug]);

  return <div ref={endRef} aria-hidden />;
}
