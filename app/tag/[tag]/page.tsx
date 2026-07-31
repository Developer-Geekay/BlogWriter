import type { Metadata } from 'next';
import { PostStore } from '@/src/db/posts';
import { PostCard } from '@/components/PostCard';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

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
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-sm uppercase tracking-wider text-[var(--color-muted)]">Topic</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{tag}</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        {posts.length} {posts.length === 1 ? 'post' : 'posts'}
      </p>

      <div className="mt-8">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
