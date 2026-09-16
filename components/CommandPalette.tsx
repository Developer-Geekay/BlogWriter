'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { kindLabel, type Post } from '@/src/db/types';

/** Idle time before a keystroke turns into a query. */
const DEBOUNCE_MS = 180;

/**
 * ⌘K — search entries.
 *
 * Only entries. It used to also list navigation and actions, which made it a
 * command menu that happened to contain posts; the header and footer already
 * navigate, and a search box that answers with "Toggle dark mode" is answering
 * a question nobody asked.
 *
 * The search runs on the server through `/api/posts?search=`, not over a list
 * held in the browser, because that endpoint searches the **body** as well as
 * the title, excerpt and tags. Finding a post by a phrase you remember from
 * inside it is the reason to open this at all. The endpoint also scopes results
 * to the session on its own — a reader only ever sees published entries, while
 * the author's own drafts turn up too.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Where focus was before the palette took it, so it can be handed back.
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    restoreTo.current?.focus();
  }, []);

  // ⌘K / Ctrl-K from anywhere. Bound once for the life of the page.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => {
          if (!was) restoreTo.current = document.activeElement as HTMLElement | null;
          return !was;
        });
        setQuery('');
      } else if (event.key === 'Escape') {
        setOpen((was) => {
          if (was) restoreTo.current?.focus();
          return false;
        });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /*
   * Debounced search.
   *
   * An empty query lists the most recent entries rather than nothing, so the
   * palette is useful before you have typed anything. `ignore` guards against a
   * slow early request landing after a faster later one and overwriting newer
   * results with older ones.
   */
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    const q = query.trim();

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '8' });
        if (q) params.set('search', q);
        const response = await fetch(`/api/posts?${params}`);
        const data = await response.json();
        if (!ignore) setResults(response.ok ? (data.posts ?? []) : []);
      } catch {
        if (!ignore) setResults([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }, q ? DEBOUNCE_MS : 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  // Keep the highlight in range as the result set changes under typing.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, results.length - 1)));
  }, [results.length]);

  const openPost = useCallback(
    (post: Post) => {
      close();
      // A draft has no public URL, so for the author it opens where it can
      // actually be read: the editor.
      router.push(post.status === 'published' ? `/entry/${post.slug}` : `/admin/posts/${post.id}/edit`);
    },
    [close, router],
  );

  if (!open) return null;

  function onDialogKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const post = results[cursor];
      if (post) openPost(post);
    } else if (event.key === 'Tab') {
      // Focus trap. The dialog is small enough that cycling the focusable set
      // by hand is simpler and less fragile than a library.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div
      onMouseDown={close}
      className="fixed inset-0 z-90 flex items-start justify-center bg-[rgba(20,19,18,0.55)] px-4 pt-[12vh]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search entries"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        className="palette w-full max-w-[560px] border-2 border-[var(--rule)] bg-[var(--ground)] shadow-[var(--shadow-lg)]"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries and their contents…"
          aria-label="Search entries and their contents"
          className="min-h-[52px] w-full border-0 border-b-2 border-[var(--rule)] bg-transparent px-3.5 py-3.5 text-base text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
        />

        <div className="max-h-[46vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3.5 py-4 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
              {loading ? 'Searching…' : query.trim() ? 'Nothing matched' : 'No entries yet'}
            </p>
          ) : (
            results.map((post, index) => (
              <button
                key={post.id}
                type="button"
                onClick={() => openPost(post)}
                onMouseEnter={() => setCursor(index)}
                className={`flex w-full flex-col gap-1 border-b border-[var(--soft)] px-3.5 py-2.5 text-left text-[var(--ink)] ${
                  index === cursor ? 'bg-[var(--panel)]' : ''
                }`}
              >
                <span className="flex items-baseline gap-2.5">
                  <span className="min-w-[70px] flex-none font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--accent-text)]">
                    {post.status === 'published' ? kindLabel(post.kind) : post.status}
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold">{post.title}</span>
                </span>
                {/* The match may be anywhere in the body, so show where it was
                    found rather than making the title carry the whole answer. */}
                <span className="pl-[82px] text-xs text-[var(--muted)]">
                  {snippet(post, query)}
                </span>
              </button>
            ))
          )}
        </div>

        <p className="border-t-2 border-[var(--soft)] px-3.5 py-2.5 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
          ESC to close · ↑↓ to move · ↵ to open
        </p>
      </div>
    </div>
  );
}

/**
 * A line of context for a result.
 *
 * When the term appears in the body, show the text around it — that is the
 * whole point of searching contents, and an excerpt that does not contain the
 * match looks like a wrong result. Otherwise fall back to the excerpt.
 */
function snippet(post: Post, query: string): string {
  const q = query.trim().toLowerCase();
  const fallback = post.excerpt || `${post.readingTime} min read`;
  if (!q) return fallback;

  const body = post.body ?? '';
  const at = body.toLowerCase().indexOf(q);
  if (at === -1) return fallback;

  const start = Math.max(0, at - 40);
  const text = body.slice(start, at + q.length + 60).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${text}…`;
}
