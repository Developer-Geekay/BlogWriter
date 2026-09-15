import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostStore } from '@/src/db/posts';
import { currentSession } from '@/src/auth/guard';
import { Markdown } from '@/components/Markdown';
import { formatDate } from '@/components/PostCard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { ReadTracker } from '@/components/ReadTracker';
import { extractOutline } from '@/src/content/outline';
import { entryNumber, kindLabel, maturityLabel } from '@/src/db/types';

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
  let siblings;
  try {
    const store = await PostStore.open();
    post = await store.findBySlug(slug);
    // The published feed in the order the reader sees it, so "previous" and
    // "next" mean the same thing here as they do on the index.
    siblings = await store.list({ status: 'published', limit: 100 });
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  // A draft has no public URL — treat it as missing rather than leaking it.
  if (!post || post.status !== 'published') notFound();

  // Only the author sees this, and only while signed in. Spotting a typo while
  // reading your own published post should not mean navigating to the portal,
  // finding the post in a list, and opening it.
  const session = await currentSession();

  const index = siblings.findIndex((p) => p.id === post.id);
  const newer = index > 0 ? siblings[index - 1] : undefined;
  const older = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const outline = extractOutline(post.body);

  return (
    <div className="mx-auto max-w-[1160px] px-4">
      <div className="pt-6">
        <Link
          href="/"
          className="inline-block pb-4 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
        >
          ← Back to log
        </Link>

        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          {index >= 0 ? (
            <span className="font-[family-name:var(--mono)] text-[11px] text-[var(--accent-text)]">
              {entryNumber(index, siblings.length)}
            </span>
          ) : null}
          <span className="bg-[var(--ink)] px-1.5 py-0.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--ground)]">
            {kindLabel(post.kind)}
          </span>
          <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {maturityLabel(post.maturity)} · {post.readingTime} MIN READ · UPDATED{' '}
            {formatDate(post.updatedAt)}
          </span>

          {session ? (
            <Link
              href={`/admin/posts/${post.id}/edit`}
              className="btn btn-secondary ml-auto font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
            >
              Edit
            </Link>
          ) : null}
        </div>

        <h1 className="mb-4 max-w-[24ch] text-[clamp(30px,6vw,60px)] font-extrabold leading-none tracking-[-0.035em]">
          {post.title}
        </h1>

        {post.excerpt ? (
          <p className="mb-6 max-w-[60ch] border-l-2 border-[var(--accent)] pl-3.5 text-[19px] leading-[1.45] text-[var(--muted)] [text-wrap:pretty]">
            {post.excerpt}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start border-t-2 border-[var(--rule)] pb-12">
        {/*
          A rail, not a column: `flex-grow: 0`.

          The article beside it is capped at a 72ch measure, so once it reaches
          that width it stops absorbing free space — and a growable sidebar then
          takes every remaining pixel. On a 1440px screen that left the contents
          list 509px wide, 45% of the row, for five short lines of mono text.
          Fixing the basis keeps the rail the size its content needs and lets
          the surplus fall to the right of the article, which is where flush-left
          layout wants it.
        */}
        <aside className="sticky top-[104px] min-w-0 self-start py-6 pr-5 [flex:0_1_280px]">
          {outline.length > 0 ? (
            <>
              <p className="mb-2.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                On this page
              </p>
              <nav className="mb-5 flex flex-col gap-2">
                {outline.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`border-l-2 border-[var(--soft)] font-[family-name:var(--mono)] text-[11px] tracking-[0.04em] text-[var(--ink)] no-underline hover:border-[var(--accent)] ${
                      item.level === 3 ? 'pl-4' : 'pl-2'
                    }`}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            </>
          ) : null}

          {post.tags.length > 0 ? (
            <>
              <p className="mb-2.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Filed under
              </p>
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tag/${encodeURIComponent(tag)}`}
                    className="border-2 border-[var(--soft)] px-1.5 py-0.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] no-underline hover:border-[var(--accent)] hover:text-[var(--ink)]"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </aside>

        {/* No max-width on the measure: the page container already caps the row
            at 1160px, so the article tops out around 800px on a desktop. A 72ch
            cap on top of that stopped the text well short of the rule above it
            and left a quarter of the row empty. */}
        <article className="min-w-0 border-l-2 border-[var(--soft)] pl-7 pt-6 [flex:3_1_440px]">
          {post.coverImage ? (
            // A remote cover URL can be any host, so use a plain <img> rather
            // than next/image, which would need every domain allow-listed.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImage} alt="" className="mb-6 w-full object-cover grayscale" />
          ) : null}

          <Markdown>{post.body}</Markdown>

          {post.sources.length > 0 ? (
            <section className="mt-10 border-t-2 border-[var(--soft)] pt-6">
              <h2 className="mb-3 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Sources
              </h2>
              <ul className="space-y-1 text-sm">
                {post.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-text)] underline underline-offset-[3px]"
                    >
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Sits after the body and the sources, so "seen" genuinely means the
              reader reached the end of the entry. */}
          <ReadTracker slug={post.slug} />

          <nav className="mt-6 flex flex-wrap gap-2.5 border-t-2 border-[var(--soft)] pt-4">
            {older ? (
              <Link
                href={`/blog/${older.slug}`}
                className="btn btn-secondary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
              >
                ← {older.title.slice(0, 40)}
              </Link>
            ) : null}
            {newer ? (
              <Link
                href={`/blog/${newer.slug}`}
                className="btn btn-secondary ml-auto font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
              >
                {newer.title.slice(0, 40)} →
              </Link>
            ) : null}
          </nav>
        </article>
      </div>
    </div>
  );
}
