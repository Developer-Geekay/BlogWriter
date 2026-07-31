import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { SettingsStore } from '@/src/db/settings';
import { PostCard } from '@/components/PostCard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

// Posts change when the author publishes, so never serve a cached shell.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let posts;
  let tags;
  let description = '';

  try {
    const store = await PostStore.open();
    [posts, tags, description] = await Promise.all([
      store.list({ status: 'published', limit: 25 }),
      store.tags(),
      (await SettingsStore.open()).get().then((s) => s.siteDescription),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="border-b border-[var(--color-rule)] py-16">
        <p className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {description}
        </p>
      </section>

      <div className="grid gap-12 py-4 md:grid-cols-[1fr_240px]">
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
