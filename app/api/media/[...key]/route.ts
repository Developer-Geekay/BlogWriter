import { NextResponse } from 'next/server';
import { requireSession } from '@/src/auth/guard';
import { MediaError, MediaStore, asMediaError, mediaConfig } from '@/src/media/store';
import { isResizable, parseSize, resizeImage } from '@/src/media/resize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ key: string[] }> };

/**
 * Shared response headers for anything the proxy serves.
 *
 * Cached hard and immutably: keys carry a random segment and are never reused,
 * and a given `?w=` of a given key is always the same bytes, so the resized
 * variants are as immutable as the originals.
 */
function imageHeaders(contentType: string, length: number): HeadersInit {
  return {
    'Content-Type': contentType,
    'Content-Length': String(length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Belt and braces on top of the upload allow-list: never let the browser
    // re-interpret these bytes as something executable, and give the response
    // no privileges of its own if it is opened directly.
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
}

/**
 * Serve an object through the app rather than linking at the bucket.
 *
 * Two reasons. A cover image URL is stored on a post and outlives any signature,
 * so a presigned link would rot; and the bucket itself can stay closed, with
 * this route the only way in. The cost is that image bytes pass through the
 * Node process — fine at this scale, and the place to add a CDN later.
 */
export async function GET(request: Request, { params }: Context) {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join('/');

  if (!mediaConfig()) {
    return NextResponse.json({ error: 'Object storage is not configured.' }, { status: 404 });
  }

  /*
   * `?w=` / `?h=` resize the image.
   *
   * Markdown cannot express image dimensions and raw HTML is off in post
   * bodies, so this query string is the only size control an author has:
   *   ![Diagram](/api/media/2026/09/x-diagram.png?w=600)
   *
   * The resized path buffers the whole image, which the untouched path avoids
   * by streaming — so it is only taken when a size was actually asked for and
   * the object is a format worth resizing.
   */
  const size = parseSize(new URL(request.url).searchParams);

  try {
    const store = MediaStore.open();

    if (size) {
      const object = await store.getBytes(key);
      if (!object) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

      if (isResizable(object.contentType)) {
        const bytes = await resizeImage(object.bytes, size);
        return new Response(bytes, { headers: imageHeaders(object.contentType, bytes.byteLength) });
      }
      // A PDF, an SVG, an animated GIF — serve it whole rather than mangling it.
      return new Response(object.bytes, {
        headers: imageHeaders(object.contentType, object.bytes.byteLength),
      });
    }

    const object = await store.get(key);
    if (!object) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    return new Response(object.body, {
      headers: {
        'Content-Type': object.contentType,
        ...(object.contentLength !== undefined
          ? { 'Content-Length': String(object.contentLength) }
          : {}),
        // Keys carry a random segment and are never reused, so a response can
        // be cached hard — replacing an image means a new key.
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Belt and braces on top of the upload allow-list: never let the
        // browser re-interpret these bytes as something executable, and give
        // the response no privileges of its own if it is opened directly.
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof MediaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: asMediaError(err).message }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join('/');

  try {
    await MediaStore.open().delete(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MediaError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: asMediaError(err).message }, { status: 503 });
  }
}
