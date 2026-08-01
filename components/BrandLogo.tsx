import Link from 'next/link';

/**
 * Monogram plus wordmark.
 *
 * Both come from `siteTitle` in Settings — the monogram is just its first
 * letter — so renaming the blog never means editing this file or redrawing an
 * icon. A monogram suits a personal byline better than a generic writing glyph.
 */
export function BrandLogo({ title, author }: { title: string; author?: string }) {
  const initial = title.trim().charAt(0).toUpperCase() || 'B';

  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label={`${title} — home`}>
      <span
        aria-hidden
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-bold text-[var(--color-surface)] transition-transform group-hover:scale-105"
      >
        {initial}
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-bold tracking-tight">{title}</span>
        {author ? (
          <span className="mt-0.5 text-xs font-normal text-[var(--color-muted)]">
            by {author}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
