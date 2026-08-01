import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { PostCard } from '@/components/PostCard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

// Posts change when the author publishes, so never serve a cached shell.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let posts;
  let tags;

  try {
    const store = await PostStore.open();
    [posts, tags] = await Promise.all([
      store.list({ status: 'published', limit: 25 }),
      store.tags(),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* No tagline hero: the posts are the point of the page. The site
          description still ships as the <meta description> for search results. */}
      <div className="grid gap-12 py-10 md:grid-cols-[1fr_240px]">
        <div>
          {posts.length === 0 ? (
            <p className="py-16 text-[var(--color-muted)]">
              Nothing published yet.{' '}
              <Link href="/admin" className="text-[var(--color-accent)] underline">
                Write the first post
              </Link>
              .
            </p>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>

        <aside className="md:border-l md:border-[var(--color-rule)] md:pl-8 md:pt-8 md:dark:border-neutral-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Topics
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.length === 0 ? (
              <span className="text-sm text-[var(--color-muted)]">No tags yet.</span>
            ) : (
              tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="rounded-full bg-[var(--color-raised)] px-3 py-1 text-sm hover:opacity-80"
                >
                  {tag} <span className="text-[var(--color-muted)]">{count}</span>
                </Link>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
