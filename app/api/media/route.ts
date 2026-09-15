import { NextResponse } from 'next/server';
import { requireSession } from '@/src/auth/guard';
import { MediaStore, asMediaError, buildKey, mediaConfig } from '@/src/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Uploads larger than this are refused before anything is read into memory. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Only formats the app can actually render.
 *
 * SVG is deliberately absent. An SVG is a document, not just an image: served
 * from this origin it can carry script, and the proxy route hands it back under
 * the site's own hostname. Nothing here needs vector uploads badly enough to
 * take that on.
 */
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
]);

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  if (!mediaConfig()) {
    return NextResponse.json({ configured: false, objects: [] });
  }

  try {
    const objects = await MediaStore.open().list();
    return NextResponse.json({ configured: true, objects });
  } catch (err) {
    return NextResponse.json({ error: asMediaError(err).message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file in the request.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 15MB.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `${file.type || 'That file type'} is not accepted. Use PNG, JPEG, WebP, AVIF or GIF.` },
      { status: 415 },
    );
  }

  try {
    const key = buildKey(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await MediaStore.open().put(key, bytes, file.type);
    // The URL the editor should paste into a cover image field — this app's own
    // proxy path, not the bucket's, so it keeps working if the endpoint moves.
    return NextResponse.json({ key, url: `/api/media/${key}` }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: asMediaError(err).message }, { status: 503 });
  }
}
