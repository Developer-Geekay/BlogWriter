import Link from 'next/link';

/**
 * Brand mark plus wordmark.
 *
 * The text is whatever `siteTitle` is set to in Settings, so renaming the blog
 * never means editing this file.
 */
export function BrandLogo({ title }: { title: string }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label={`${title} — home`}>
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[var(--color-ink)] text-[var(--color-surface)] transition-transform group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden>
          {/* A nib: writing, without leaning on a generic pencil glyph. */}
          <path
            d="M5 19 19 5M13 5h6v6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="17" r="2.5" fill="currentColor" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight">{title}</span>
    </Link>
  );
}
