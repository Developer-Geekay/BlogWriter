import type { Metadata } from 'next';
import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { PostCard } from '@/components/PostCard';
import { SearchBox } from '@/components/SearchBox';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { entryNumber } from '@/src/db/types';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : 'Search' };
}

export default async function SearchPage({ searchParams }: Props) {
  const query = (await searchParams).q?.trim() ?? '';

  let posts;
  let tags;
  try {
    const store = await PostStore.open();
    // Only ever search published posts here — drafts are not public.
    [posts, tags] = await Promise.all([
      query ? store.list({ status: 'published', search: query, limit: 50 }) : Promise.resolve([]),
      store.tags(),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  // A query can also name a topic directly, so surface matching tags as a
  // shortcut to the tag page rather than making the reader scan results.
  const matchingTags = query
    ? tags.filter(({ tag }) => tag.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <div className="mx-auto max-w-[1160px] px-4">
      <section className="border-b-2 border-[var(--rule)] pb-5 pt-7">
        <h1 className="mb-4 text-[clamp(30px,7.5vw,52px)] font-extrabold leading-[1.02] tracking-[-0.035em]">
          Search
        </h1>
        <div className="max-w-[560px]">
          <SearchBox initialQuery={query} />
        </div>
        <p className="mt-3 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          {query
            ? `${posts.length} ${posts.length === 1 ? 'result' : 'results'} for “${query}”`
            : 'Titles, summaries, tags and the full text of every entry'}
        </p>
      </section>

      {matchingTags.length > 0 ? (
        <section className="border-b-2 border-[var(--soft)] py-3.5">
          <p className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Matching topics
          </p>
          <div className="flex flex-wrap gap-2">
            {matchingTags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag)}`}
                className="tag tag-neutral font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
              >
                {tag} {count}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="pb-12">
        {query && posts.length === 0 ? (
          <div className="py-16 text-[var(--muted)]">
            <p>Nothing matched that.</p>
            <p className="mt-2 text-sm">
              Try a single word, or{' '}
              <Link href="/" className="text-[var(--accent-text)] underline">
                browse everything
              </Link>
              .
            </p>
          </div>
        ) : (
          posts.map((post, index) => (
            <PostCard key={post.id} post={post} number={entryNumber(index, posts.length)} />
          ))
        )}

        {!query && tags.length > 0 ? (
          <section className="pt-8">
            <p className="mb-3 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              All topics
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="tag tag-neutral font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
                >
                  {tag} {count}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
