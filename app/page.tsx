import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { PostCard } from '@/components/PostCard';
import { TypewriterThoughts } from '@/components/TypewriterThoughts';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { currentSession } from '@/src/auth/guard';

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

  // Nothing to show and nothing to tag: give the page over to a thought
  // instead of rendering an empty feed beside an empty sidebar.
  if (posts.length === 0) {
    const session = await currentSession();
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 sm:py-32">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Nothing published yet
        </p>
        <div className="mt-6">
          <TypewriterThoughts />
        </div>
        {/* Only the author can act on this; readers are not shown a control
            they cannot use, which is why there is no public sign-in link. */}
        {session ? (
          <Link
            href="/admin/posts/new"
            className="mt-10 inline-block rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Write the first post
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5">
      <div className="grid gap-12 py-10 md:grid-cols-[1fr_240px]">
        <div>{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>

        <aside className="md:border-l md:border-[var(--color-rule)] md:pl-8 md:pt-8">
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
