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
        <div className="flex min-w-0 flex-wrap items-center gap-2 [flex:1_1_150px]">
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

        <div className="min-w-0 [flex:3_1_320px]">
          <h2 className="mb-2 max-w-[32ch] text-[clamp(21px,3.4vw,30px)] font-extrabold leading-[1.1] tracking-[-0.025em] text-[var(--ink)]">
            {post.title}
          </h2>
          {post.excerpt ? (
            <p className="mb-2 max-w-[60ch] text-[15px] text-[var(--muted)] [text-wrap:pretty]">
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
