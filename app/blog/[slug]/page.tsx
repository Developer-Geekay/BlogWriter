import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostStore } from '@/src/db/posts';
import { Markdown } from '@/components/Markdown';
import { formatDate } from '@/components/PostCard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await (await PostStore.open()).findBySlug(slug).catch(() => null);
  if (!post) return { title: 'Not found' };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;

  let post;
  try {
    post = await (await PostStore.open()).findBySlug(slug);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  // A draft has no public URL — treat it as missing rather than leaking it.
  if (!post || post.status !== 'published') notFound();

  return (
    <article className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>

      {post.excerpt ? (
        <p className="mt-4 text-xl text-[var(--color-muted)]">{post.excerpt}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] pb-6 text-sm text-[var(--color-muted)]">
        <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
        <span aria-hidden>·</span>
        <span>{post.readingTime} min read</span>
      </div>

      {post.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverImage} alt="" className="mt-8 w-full rounded-lg object-cover" />
      ) : null}

      <div className="mt-8">
        <Markdown>{post.body}</Markdown>
      </div>

      {post.tags.length > 0 ? (
        <div className="mt-12 flex flex-wrap gap-2 border-t border-[var(--color-rule)] pt-8">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/tag/${encodeURIComponent(tag)}`}
              className="rounded-full bg-[var(--color-raised)] px-4 py-1.5 text-sm hover:opacity-80"
            >
              {tag}
            </Link>
          ))}
        </div>
      ) : null}

      {post.sources.length > 0 ? (
        <section className="mt-10 border-t border-[var(--color-rule)] pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Sources
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            {post.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  {source.title || source.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
