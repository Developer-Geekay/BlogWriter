import { NextResponse } from 'next/server';
import { PostStore, PostNotFoundError, SlugTakenError } from '@/src/db/posts';
import { PostUpdateSchema } from '@/src/db/types';
import { requireSession } from '@/src/auth/guard';
import { storageFailure } from '@/src/api/errors';
import { InvalidSlugError } from '@/src/store/slug';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  let post;
  try {
    post = await (await PostStore.open()).findById(id);
  } catch (err) {
    return storageFailure(err);
  }
  if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });

  // Drafts are only visible to the author.
  if (post.status !== 'published') {
    const auth = await requireSession();
    if (!auth.ok) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
  }
  return NextResponse.json({ post });
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = PostUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid changes.', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const post = await (await PostStore.open()).update(id, parsed.data);
    return NextResponse.json({ post });
  } catch (err) {
    if (err instanceof PostNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof SlugTakenError || err instanceof InvalidSlugError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return storageFailure(err);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await (await PostStore.open()).delete(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PostNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return storageFailure(err);
  }
}
