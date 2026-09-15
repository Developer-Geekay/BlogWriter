import type { Metadata } from 'next';
import { PostStore } from '@/src/db/posts';
import { PostCard } from '@/components/PostCard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { entryNumber } from '@/src/db/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  return { title: `Posts tagged “${decodeURIComponent(tag)}”` };
}

export default async function TagPage({ params }: Props) {
  const { tag: raw } = await params;
  const tag = decodeURIComponent(raw);
  let posts;
  try {
    posts = await (await PostStore.open()).list({ status: 'published', tag, limit: 50 });
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  return (
    <div className="mx-auto max-w-[1160px] px-4">
      <section className="border-b-2 border-[var(--rule)] pb-5 pt-7">
        <p className="mb-3 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
          Topic
        </p>
        <h1 className="mb-2 text-[clamp(30px,7.5vw,52px)] font-extrabold leading-[1.02] tracking-[-0.035em]">
          {tag}
        </h1>
        <p className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          {posts.length} {posts.length === 1 ? 'entry' : 'entries'}
        </p>
      </section>

      <div className="pb-12">
        {posts.map((post, index) => (
          <PostCard key={post.id} post={post} number={entryNumber(index, posts.length)} />
        ))}
      </div>
    </div>
  );
}
