import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { DatabaseError } from '@/src/db/client';
import { formatDate } from '@/components/PostCard';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  let posts;
  try {
    posts = await (await PostStore.open()).list({ limit: 100 });
  } catch (err) {
    if (err instanceof DatabaseError) {
      return (
        <div className="rounded border border-red-300 bg-red-50 p-6 dark:bg-red-950/30">
          <h1 className="font-semibold text-red-900 dark:text-red-200">
            The database is not reachable
          </h1>
          <p className="mt-2 whitespace-pre-line text-sm text-red-800 dark:text-red-300">
            {err.message}
          </p>
        </div>
      );
    }
    throw err;
  }

  const counts = {
    published: posts.filter((p) => p.status === 'published').length,
    draft: posts.filter((p) => p.status === 'draft').length,
    archived: posts.filter((p) => p.status === 'archived').length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {counts.published} published · {counts.draft} draft · {counts.archived} archived
          </p>
        </div>
        <Link
          href="/admin/posts/new"
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="py-16 text-[var(--color-muted)]">
          No posts yet. Write one here, or let a connected AI client draft one over MCP.
        </p>
      ) : (
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-rule)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <th className="pb-2 font-semibold">Title</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 font-semibold">Date</th>
              <th className="pb-2 font-semibold">Tags</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr
                key={post.id}
                className="border-b border-[var(--color-rule)]"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/admin/posts/${post.id}/edit`}
                    className="font-medium hover:text-[var(--color-accent)]"
                  >
                    {post.title}
                  </Link>
                  {post.unsupportedClaims.length > 0 ? (
                    <span
                      title={`${post.unsupportedClaims.length} unverified claim(s)`}
                      className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900"
                    >
                      {post.unsupportedClaims.length} unverified
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      post.status === 'published'
                        ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
                        : 'rounded-full bg-[var(--color-raised)] px-2 py-0.5 text-xs text-neutral-700'
                    }
                  >
                    {post.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">
                  {formatDate(post.publishedAt ?? post.updatedAt)}
                </td>
                <td className="py-3 pr-4 text-[var(--color-muted)]">
                  {post.tags.slice(0, 3).join(', ')}
                </td>
                <td className="py-3 text-right">
                  {post.status === 'published' ? (
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                    >
                      View
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
