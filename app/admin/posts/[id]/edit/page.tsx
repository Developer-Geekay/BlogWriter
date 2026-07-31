import { notFound } from 'next/navigation';
import { PostStore } from '@/src/db/posts';
import { PostEditor } from '@/components/PostEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit post' };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await (await PostStore.open()).findById(id);
  if (!post) notFound();

  return <PostEditor post={post} />;
}
