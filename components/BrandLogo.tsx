import Link from 'next/link';

/**
 * The wordmark.
 *
 * Just the publication name — the mono kicker beside it names which side of the
 * app you are on, not who wrote it, so the author byline that used to sit here
 * would be competing for the same slot. The author still appears in the footer
 * and on the about page.
 *
 * The design also drops the circular monogram the previous look used: a round
 * badge has no place in a system whose first rule is that nothing is rounded.
 */
export function BrandLogo({ title }: { title: string }) {
  return (
    <Link
      href="/"
      // `min-w-0` is what lets the wordmark truncate instead of holding the
      // header open: a flex item defaults to min-width:auto, so without it the
      // title's full width is a hard floor and the controls beside it get
      // pushed off a phone screen.
      className="flex min-w-0 shrink items-baseline no-underline"
      aria-label={`${title} — home`}
    >
      <span className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">
        {title}
      </span>
    </Link>
  );
}
