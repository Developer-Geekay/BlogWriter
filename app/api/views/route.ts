import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PostStore } from '@/src/db/posts';
import { ViewStore, classifySource } from '@/src/db/views';
import { storageFailure } from '@/src/api/errors';

export const runtime = 'nodejs';

const BeaconSchema = z.object({
  slug: z.string().min(1).max(120),
  /** Sent as a second beacon once the reader reaches the end of the article. */
  finished: z.boolean().default(false),
  /** `document.referrer` from the page. Classified server-side. */
  referrer: z.string().max(2048).optional(),
});

/**
 * Records one read.
 *
 * Called from the browser rather than incremented while rendering the page:
 * the entry page is `force-dynamic`, so a server-side counter would also count
 * crawlers, link prefetches and every internal re-render. A beacon counts
 * people.
 *
 * Public by necessity — readers are anonymous — so the numbers are only as
 * trustworthy as any client-reported metric. The guards here keep the
 * collection clean rather than making the counts unforgeable: an unknown or
 * unpublished slug is refused, so the data can never contain a post that does
 * not exist.
 */
export async function POST(request: Request) {
  const parsed = BeaconSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid beacon.' }, { status: 400 });
  }

  const { slug, finished, referrer } = parsed.data;

  try {
    const post = await (await PostStore.open()).findBySlug(slug);
    if (!post || post.status !== 'published') {
      // Same answer for "no such post" and "not public", matching how the entry
      // page itself refuses to distinguish the two.
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const selfHost = (() => {
      try {
        return new URL(request.url).hostname;
      } catch {
        return undefined;
      }
    })();

    await (await ViewStore.open()).record({
      slug,
      finished,
      source: classifySource(referrer, selfHost),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return storageFailure(err);
  }
}
