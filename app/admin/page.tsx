import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { ViewStore } from '@/src/db/views';
import { currentSession } from '@/src/auth/guard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { Sparkline } from '@/components/Sparkline';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

/** Drafts untouched for longer than this are called out as stale. */
const STALE_AFTER_DAYS = 14;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function AdminDashboard() {
  let posts;
  let totals;
  let series;
  try {
    const [postStore, viewStore] = await Promise.all([PostStore.open(), ViewStore.open()]);
    [posts, totals, series] = await Promise.all([
      postStore.list({ limit: 100 }),
      viewStore.totals(30),
      viewStore.dailySeries(14),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  const session = await currentSession();
  const firstName = (session?.name || session?.email || '').split(/[\s@]/)[0] ?? '';

  const published = posts.filter((p) => p.status === 'published');
  const drafts = posts.filter((p) => p.status === 'draft');
  const stale = drafts.filter((p) => daysSince(p.updatedAt) >= STALE_AFTER_DAYS);
  const thisMonth = published.filter(
    (p) => p.publishedAt && daysSince(p.publishedAt) <= 30,
  ).length;

  const stats = [
    {
      label: 'Reads / 30d',
      value: totals.reads.toLocaleString('en-GB'),
      note: totals.reads === 0 ? 'no reads recorded yet' : '',
    },
    {
      label: 'Published',
      value: String(published.length),
      note: thisMonth > 0 ? `+${thisMonth} this month` : '',
    },
    {
      label: 'Drafts',
      value: String(drafts.length).padStart(2, '0'),
      note: stale.length > 0 ? `${stale.length} stale` : drafts.length > 0 ? 'all fresh' : '',
    },
    {
      // Null rather than 0% when nothing has been read — a real zero would
      // claim nobody finishes anything, which is a different statement.
      label: 'Finish rate',
      value: totals.finishRate === null ? '—' : `${totals.finishRate}%`,
      note: totals.finishRate === null ? 'needs reads' : `${totals.finishes} finished`,
    },
  ];

  // Drafts, oldest edit first — the ones most likely to have been forgotten.
  const queue = [...drafts].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 5);
  const peak = series.reduce((best, day) => (day.reads > best.reads ? day : best), series[0]!);

  return (
    <div>
      <section className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[var(--rule)] pb-4 pt-6">
        <div>
          <p className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
            Control room
          </p>
          <h1 className="text-[clamp(28px,6.5vw,42px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
        </div>
        <Link
          href="/admin/posts/new"
          className="btn btn-primary font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em] no-underline"
        >
          + New entry
        </Link>
      </section>

      <section className="grid border-b-2 border-l-2 border-b-[var(--rule)] border-l-[var(--soft)] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        {stats.map((stat) => (
          <div key={stat.label} className="border-r-2 border-[var(--soft)] px-4 py-4">
            <div className="mb-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {stat.label}
            </div>
            <div className="text-3xl font-extrabold tracking-[-0.03em]">{stat.value}</div>
            <div className="min-h-[15px] font-[family-name:var(--mono)] text-[10px] uppercase text-[var(--accent-text)]">
              {stat.note}
            </div>
          </div>
        ))}
      </section>

      <section className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <div className="border-b-2 border-r-2 border-[var(--soft)] px-4 py-5">
          <p className="mb-3.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Needs you
          </p>
          {queue.length === 0 ? (
            <p className="py-4 text-sm text-[var(--muted)]">
              No drafts waiting. Everything written is published or archived.
            </p>
          ) : (
            queue.map((post) => {
              const age = daysSince(post.updatedAt);
              return (
                <Link
                  key={post.id}
                  href={`/admin/posts/${post.id}/edit`}
                  className="flex w-full items-baseline gap-2.5 border-b border-[var(--soft)] py-2.5 text-[var(--ink)] no-underline hover:bg-[var(--panel)]"
                >
                  <span className="min-w-[66px] flex-none font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--accent-text)]">
                    {age >= STALE_AFTER_DAYS ? `Stale ${age}d` : `${age}d`}
                  </span>
                  <span className="min-w-0 truncate text-[15px] font-semibold">{post.title}</span>
                </Link>
              );
            })
          )}
        </div>

        <div className="border-b-2 border-[var(--soft)] px-4 py-5">
          <p className="mb-3.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Reads, last 14 days
          </p>
          <Sparkline series={series} />
          <p className="mt-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {peak.reads > 0
              ? `Peak ${peak.reads.toLocaleString('en-GB')} · ${formatDay(peak.date)}`
              : 'Nothing read yet in this window'}
          </p>
        </div>
      </section>
    </div>
  );
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase();
}
