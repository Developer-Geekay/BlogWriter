/**
 * Site footer — the colophon line, and nothing else.
 *
 * The design also put reader navigation and a "press ⌘K anywhere" hint here;
 * both were removed by request. The palette is still bound and the ⌘K button in
 * the header remains its visible affordance.
 */
export function SiteFooter({ siteName, author }: { siteName: string; author?: string }) {
  return (
    <footer className="mt-2 border-t-2 border-[var(--rule)]">
      <div className="mx-auto max-w-[1160px] px-4 pb-8 pt-5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        <span>
          {siteName}
          {author ? ` — ${author}` : ''}
        </span>
      </div>
    </footer>
  );
}
