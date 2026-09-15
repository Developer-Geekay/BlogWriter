import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { ViewStore, VIEW_SOURCES } from '@/src/db/views';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

const WINDOW_DAYS = 30;

/**
 * Reads, from this site's own tracking.
 *
 * The numbers come from the `views` collection in the same database as the
 * posts, written by the beacon on each entry page. The external analytics
 * platform the site also reports to has no read API, so nothing here comes from
 * it — this screen and that dashboard will not agree, and this one is the one
 * that can be audited.
 */
export default async function AnalyticsPage() {
  let top;
  let totals;
  let sources;
  let posts;
  try {
    const [postStore, viewStore] = await Promise.all([PostStore.open(), ViewStore.open()]);
    [top, totals, sources, posts] = await Promise.all([
      viewStore.topPosts(WINDOW_DAYS, 8),
      viewStore.totals(WINDOW_DAYS),
      viewStore.sources(WINDOW_DAYS),
      postStore.list({ status: 'published', limit: 100 }),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  const titleFor = new Map(posts.map((p) => [p.slug, p.title]));
  const peak = top[0]?.reads ?? 0;
  const sourceTotal = VIEW_SOURCES.reduce((sum, key) => sum + sources[key], 0);

  return (
    <div>
      <section className="border-b-2 border-[var(--rule)] pb-4 pt-6">
        <h1 className="mb-2 text-[clamp(26px,6vw,38px)] font-extrabold tracking-[-0.03em]">
          What people read
        </h1>
        <p className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Last {WINDOW_DAYS} days · {totals.reads.toLocaleString('en-GB')} reads ·{' '}
          {totals.finishRate === null ? 'no finish rate yet' : `${totals.finishRate}% finished`}
        </p>
      </section>

      {top.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">
          No reads recorded in the last {WINDOW_DAYS} days. Counting starts the first time someone
          opens a published entry.
        </p>
      ) : (
        <section className="border-b-2 border-[var(--rule)] py-4">
          {top.map((row) => (
            <div key={row.slug} className="border-b border-[var(--soft)] py-3">
              <div className="mb-1.5 flex justify-between gap-3">
                <Link
                  href={`/blog/${row.slug}`}
                  className="min-w-0 truncate text-[15px] font-semibold text-[var(--ink)] no-underline hover:text-[var(--accent-text)]"
                >
                  {/* A slug with no matching post is one that was renamed or
                      deleted after it was read. Show the slug rather than
                      dropping the row — the reads really happened. */}
                  {titleFor.get(row.slug) ?? row.slug}
                </Link>
                <span className="flex-none font-[family-name:var(--mono)] text-[11px] text-[var(--muted)]">
                  {row.reads.toLocaleString('en-GB')}
                </span>
              </div>
              <div aria-hidden className="h-2 bg-[var(--panel)]">
                <div
                  className="h-2 bg-[var(--accent)]"
                  style={{ width: `${peak > 0 ? Math.max(2, (row.reads / peak) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="grid border-l-2 border-[var(--soft)] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {VIEW_SOURCES.map((key) => {
          const count = sources[key];
          const share = sourceTotal > 0 ? Math.round((count / sourceTotal) * 100) : null;
          return (
            <div key={key} className="border-b-2 border-r-2 border-[var(--soft)] p-4">
              <div className="text-2xl font-extrabold tracking-[-0.03em]">
                {share === null ? '—' : `${share}%`}
              </div>
              <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                {key} {count > 0 ? `· ${count.toLocaleString('en-GB')}` : ''}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
