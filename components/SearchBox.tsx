'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Header search. Submitting navigates to /search so results are server-rendered
 * and the URL is shareable, rather than living in component state.
 */
export function SearchBox({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses search, the convention on documentation and blog sites.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const q = query.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="relative"
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={input}
        type="search"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search posts…"
        aria-label="Search posts"
        className="w-36 rounded-full border border-[var(--color-rule)] bg-[var(--color-raised)] py-1.5 pl-9 pr-3 text-sm outline-none transition-all placeholder:text-[var(--color-muted)] focus:w-56 focus:border-[var(--color-accent)] sm:w-44"
      />
    </form>
  );
}
