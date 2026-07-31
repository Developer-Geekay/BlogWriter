import Link from 'next/link';
import type { Post } from '@/src/db/types';

export function formatDate(iso: string | null): string {
  if (!iso) return 'Unpublished';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="border-b border-[var(--color-rule)] py-8">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <Link href={`/blog/${post.slug}`} className="group">
            <h2 className="text-2xl font-bold leading-snug tracking-tight group-hover:underline">
              {post.title}
            </h2>
            {post.excerpt ? (
              <p className="mt-2 line-clamp-2 text-[var(--color-muted)]">{post.excerpt}</p>
            ) : null}
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--color-muted)]">
            <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
            <span aria-hidden>·</span>
            <span>{post.readingTime} min read</span>
            {post.tags.slice(0, 2).map((tag) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag)}`}
                className="rounded-full bg-[var(--color-raised)] px-3 py-1 text-xs hover:opacity-80"
              >
                {tag}
              </Link>
            ))}
          </div>
        </div>

        {post.coverImage ? (
          // A remote cover URL can be any host, so use a plain <img> rather than
          // next/image, which would need every domain allow-listed up front.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt=""
            className="h-28 w-28 flex-none rounded object-cover sm:h-32 sm:w-48"
          />
        ) : null}
      </div>
    </article>
  );
}
