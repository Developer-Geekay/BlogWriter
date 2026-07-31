import type { Metadata } from 'next';
import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { PostCard } from '@/components/PostCard';
import { SearchBox } from '@/components/SearchBox';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

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
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Search</h1>

      <div className="mt-6 sm:hidden">
        <SearchBox initialQuery={query} />
      </div>

      {query ? (
        <p className="mt-4 text-[var(--color-muted)]">
          {posts.length} {posts.length === 1 ? 'result' : 'results'} for{' '}
          <span className="font-medium text-[var(--color-ink)]">“{query}”</span>
        </p>
      ) : (
        <p className="mt-4 text-[var(--color-muted)]">
          Search across titles, summaries, tags, and the full text of every post.
        </p>
      )}

      {matchingTags.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Matching topics
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {matchingTags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag)}`}
                className="rounded-full bg-[var(--color-raised)] px-3 py-1 text-sm hover:opacity-80"
              >
                {tag} <span className="text-[var(--color-muted)]">{count}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        {query && posts.length === 0 ? (
          <div className="border-t border-[var(--color-rule)] py-16 text-[var(--color-muted)]">
            <p>Nothing matched that.</p>
            <p className="mt-2 text-sm">
              Try a single word, or{' '}
              <Link href="/" className="text-[var(--color-accent)] underline">
                browse everything
              </Link>
              .
            </p>
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>

      {!query && tags.length > 0 ? (
        <div className="mt-8 border-t border-[var(--color-rule)] pt-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            All topics
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag)}`}
                className="rounded-full bg-[var(--color-raised)] px-3 py-1 text-sm hover:opacity-80"
              >
                {tag} <span className="text-[var(--color-muted)]">{count}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
