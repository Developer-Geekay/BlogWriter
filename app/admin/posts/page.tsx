import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { formatDate } from '@/components/PostCard';
import { POST_STATUSES, entryNumber, kindLabel, type PostStatus } from '@/src/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entries' };

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminPostsPage({ searchParams }: Props) {
  const requested = (await searchParams).status;
  const status = (POST_STATUSES as readonly string[]).includes(requested ?? '')
    ? (requested as PostStatus)
    : undefined;

  let posts;
  try {
    posts = await (await PostStore.open()).list({ limit: 100, ...(status ? { status } : {}) });
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  return (
    <div>
      <section className="border-b-2 border-[var(--rule)] pb-4 pt-6">
        <h1 className="mb-3.5 text-[clamp(26px,6vw,38px)] font-extrabold tracking-[-0.03em]">
          Entries
        </h1>
        <div className="flex flex-wrap gap-2">
          <StatusChip href="/admin/posts" label="All" active={!status} />
          {POST_STATUSES.map((value) => (
            <StatusChip
              key={value}
              href={`/admin/posts?status=${value}`}
              label={value}
              active={status === value}
            />
          ))}
        </div>
      </section>

      {posts.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">
          Nothing here. Start one with <span className="font-semibold">+ New entry</span>, or let a
          connected AI client draft one over MCP.
        </p>
      ) : (
        <section>
          {posts.map((post, index) => (
            <div
              key={post.id}
              className="grid items-center gap-2 border-b-2 border-[var(--soft)] py-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
            >
              <div className="min-w-0">
                <div className="mb-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                  {entryNumber(index, posts.length)} · {kindLabel(post.kind)}
                </div>
                <div className="truncate text-base font-bold tracking-[-0.01em]">{post.title}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                <span
                  className={`tag ${post.status === 'published' ? 'tag-neutral' : 'tag-accent'} font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]`}
                >
                  {post.status}
                </span>
                <span>{formatDate(post.publishedAt ?? post.updatedAt)}</span>
                {post.unsupportedClaims.length > 0 ? (
                  <span
                    title={`${post.unsupportedClaims.length} unverified claim(s)`}
                    className="tag tag-accent font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
                  >
                    {post.unsupportedClaims.length} unverified
                  </span>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/admin/posts/${post.id}/edit`}
                  className="btn btn-primary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
                >
                  Edit
                </Link>
                {post.status === 'published' ? (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="btn btn-secondary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
                  >
                    View
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Solid accent when selected, matching the reader-side filter chips. */
function StatusChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`tag font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline ${
        active
          ? 'bg-[var(--accent)] text-[var(--ground)]'
          : 'tag-neutral hover:bg-[var(--color-neutral-300)]'
      }`}
    >
      {label}
    </Link>
  );
}
