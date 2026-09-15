'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The full-text search field on `/search`.
 *
 * The header no longer carries one — ⌘K covers jumping to a known entry, which
 * is what the header field was mostly used for. This stays because the palette
 * only matches titles, and searching the body of every post is a different job.
 */
export function SearchBox({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = query.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="flex w-full gap-2"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the full text of every entry…"
        aria-label="Search entries"
        className="input min-h-[44px] flex-1 text-[15px]"
      />
      <button
        type="submit"
        className="btn btn-primary flex-none font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em]"
      >
        Search
      </button>
    </form>
  );
}
