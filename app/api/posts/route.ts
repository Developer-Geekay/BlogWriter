import { NextResponse } from 'next/server';
import { PostStore } from '@/src/db/posts';
import { PostCreateSchema, POST_STATUSES, type PostStatus } from '@/src/db/types';
import { requireSession } from '@/src/auth/guard';
import { InvalidSlugError } from '@/src/store/slug';

export const runtime = 'nodejs';

/**
 * List posts.
 *
 * Anonymous callers only ever see published posts; a signed-in author may ask
 * for drafts. Without that check the `status` parameter would expose unpublished
 * work to anyone who guessed the query string.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('status');
  const session = await requireSession();

  let status: PostStatus | undefined;
  if (session.ok) {
    status =
      requested && (POST_STATUSES as readonly string[]).includes(requested)
        ? (requested as PostStatus)
        : undefined;
  } else {
    status = 'published';
  }

  const store = await PostStore.open();
  const options = {
    ...(status ? { status } : {}),
    ...(url.searchParams.get('tag') ? { tag: url.searchParams.get('tag')! } : {}),
    ...(url.searchParams.get('search') ? { search: url.searchParams.get('search')! } : {}),
    limit: Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100),
    skip: Math.max(Number(url.searchParams.get('skip') ?? 0) || 0, 0),
  };

  const [posts, total] = await Promise.all([store.list(options), store.count(options)]);
  return NextResponse.json({ posts, total });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const parsed = PostCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid post.', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const post = await (await PostStore.open()).create(parsed.data);
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidSlugError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
