import Link from 'next/link';
import { kindLabel, maturityLabel, type Post } from '@/src/db/types';

export function formatDate(iso: string | null): string {
  if (!iso) return 'Unpublished';
  return new Date(iso)
    .toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })
    .toUpperCase();
}

/**
 * One entry in a list.
 *
 * A two-column row: the metadata rail on the left, the entry itself on the
 * right. Below ~640px the rail wraps above the title rather than squeezing —
 * `flex-basis` on both children does that without a media query.
 *
 * `number` is the derived sequence label ("014"). It is passed in rather than
 * read off the post because it depends on position in the list being rendered,
 * which the post itself cannot know.
 */
export function PostCard({ post, number }: { post: Post; number?: string }) {
  return (
    <article className="border-b-2 border-[var(--soft)]">
      <Link
        href={`/blog/${post.slug}`}
        className="flex flex-wrap items-start gap-x-6 gap-y-2.5 py-5 no-underline hover:bg-[var(--panel)]"
      >
        {/* A fixed rail, not a growing column. With `flex-grow` it took a share
            of every spare pixel, so on a wide screen the four short mono labels
            sat against the left edge with a few hundred pixels of nothing
            between them and the title. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 [flex:0_1_200px]">
          {number ? (
            <span className="font-[family-name:var(--mono)] text-[11px] text-[var(--accent-text)]">
              {number}
            </span>
          ) : null}
          <span className="bg-[var(--ink)] px-1.5 py-0.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--ground)]">
            {kindLabel(post.kind)}
          </span>
          <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {maturityLabel(post.maturity)} · {post.readingTime} MIN
          </span>
        </div>

        <div className="min-w-0 [flex:1_1_320px]">
          {/* The title runs to the column edge. A 32ch cap made it wrap after
              four or five words while the row had room to spare. */}
          <h2 className="mb-2 text-[clamp(21px,3.4vw,30px)] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--ink)]">
            {post.title}
          </h2>
          {post.excerpt ? (
            // The excerpt keeps a measure — it is body copy, and the column is
            // wide enough now that an uncapped line would be hard to track.
            <p className="mb-2 max-w-[78ch] text-[15px] text-[var(--muted)] [text-wrap:pretty]">
              {post.excerpt}
            </p>
          ) : null}
          <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {post.tags[0] ? `${post.tags[0]} · ` : ''}
            {formatDate(post.publishedAt)}
          </span>
        </div>
      </Link>
    </article>
  );
}
