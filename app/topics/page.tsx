import type { Metadata } from 'next';
import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { POST_MATURITIES, maturityLabel } from '@/src/db/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Topics' };

/** What each maturity level claims, spelled out for the reader. */
const MATURITY_MEANING: Record<(typeof POST_MATURITIES)[number], string> = {
  seed: 'rough, still thinking',
  growing: 'usable, incomplete',
  evergreen: 'I stand behind it',
};

export default async function TopicsPage() {
  let tags;
  let posts;
  try {
    const store = await PostStore.open();
    [tags, posts] = await Promise.all([
      store.tags(),
      store.list({ status: 'published', limit: 100 }),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  return (
    <div className="mx-auto max-w-[1160px] px-4">
      <section className="border-b-2 border-[var(--rule)] pb-5 pt-7">
        <p className="mb-3 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
          Map
        </p>
        <h1 className="mb-3 text-[clamp(30px,7.5vw,52px)] font-extrabold leading-[1.02] tracking-[-0.035em]">
          Topics, and what they lead to.
        </h1>
        <p className="max-w-[54ch] text-[17px] text-[var(--muted)]">
          Entries hang off topics. Follow the links rather than the dates.
        </p>
      </section>

      {tags.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">No topics yet — they appear as entries are tagged.</p>
      ) : (
        <section className="grid border-l-2 border-[var(--soft)] [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {tags.map(({ tag, count }) => {
            // Up to three entries per topic, newest first — enough to show what
            // the topic actually contains without reprinting the whole index.
            const links = posts.filter((p) => p.tags.includes(tag)).slice(0, 3);
            return (
              <div
                key={tag}
                className="border-b-2 border-r-2 border-[var(--soft)] px-4 py-5"
              >
                <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
                  <h2 className="text-xl font-extrabold tracking-[-0.02em]">{tag}</h2>
                  <span className="font-[family-name:var(--mono)] text-[11px] text-[var(--accent-text)]">
                    {String(count).padStart(2, '0')}
                  </span>
                </div>

                <div className="mb-3 flex flex-col gap-1.5">
                  {links.map((post) => (
                    <Link
                      key={post.id}
                      href={`/entry/${post.slug}`}
                      className="font-[family-name:var(--mono)] text-[11px] tracking-[0.04em] text-[var(--ink)] no-underline hover:text-[var(--accent-text)]"
                    >
                      → {post.title}
                    </Link>
                  ))}
                </div>

                <Link
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
                >
                  All {count} →
                </Link>
              </div>
            );
          })}
        </section>
      )}

      <section className="pb-12 pt-9">
        <p className="mb-2.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Maturity legend
        </p>
        <div className="flex flex-wrap gap-2.5">
          {POST_MATURITIES.map((maturity) => (
            <span
              key={maturity}
              className="border-2 border-[var(--rule)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
            >
              {maturityLabel(maturity)} — {MATURITY_MEANING[maturity]}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
