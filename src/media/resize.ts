import sharp from 'sharp';

/**
 * On-the-fly image resizing for the media proxy.
 *
 * Markdown has no syntax for image dimensions, and raw HTML is deliberately off
 * in post bodies (see components/Markdown.tsx) because an AI client writes some
 * of them. A query parameter is the one lever an author has inside plain
 * Markdown: `![Diagram](/api/media/2026/09/x-diagram.png?w=600)`.
 *
 * It resizes the bytes rather than just the display box, which is the point —
 * an 800KB screenshot shown 600px wide should cost 600px of bytes, not 800KB.
 */

/** Below this an image is a thumbnail; above it, larger than any layout column. */
const MIN_DIMENSION = 16;
const MAX_DIMENSION = 4000;

/**
 * Formats worth resizing.
 *
 * GIF is excluded because resizing one without `animated: true` silently keeps
 * the first frame and throws the animation away — quietly breaking an image is
 * worse than serving it whole. SVG is excluded because it is already
 * resolution-independent, and rasterising it would change what the URL returns.
 * Anything else the bucket holds — the proxy also serves PDFs — is passed
 * through untouched.
 */
const RESIZABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

export interface RequestedSize {
  width?: number;
  height?: number;
}

function dimension(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  // Garbage is ignored rather than rejected: these URLs sit inside published
  // posts, and a typo should render the image at full size, not a broken icon.
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return undefined;
  // Clamped for the same reason, and because an unbounded value is a request to
  // allocate an arbitrarily large bitmap on the server.
  return Math.min(Math.max(Math.trunc(value), MIN_DIMENSION), MAX_DIMENSION);
}

/** `null` when neither dimension was asked for, so the caller can skip decoding. */
export function parseSize(params: URLSearchParams): RequestedSize | null {
  const width = dimension(params.get('w'));
  const height = dimension(params.get('h'));
  if (width === undefined && height === undefined) return null;
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

export function isResizable(contentType: string): boolean {
  return RESIZABLE.has(contentType.split(';')[0]!.trim().toLowerCase());
}

/**
 * Resize, preserving the original format and aspect ratio.
 *
 * `withoutEnlargement` matters: asking for 2000px of a 600px screenshot returns
 * the 600px original rather than a blurred upscale, so an author can set a
 * generous width without having to know what they uploaded.
 *
 * `fit: 'inside'` means width and height are a bounding box, not a crop. Giving
 * both never distorts the image — it fits within them and keeps its proportions.
 */
export async function resizeImage(
  bytes: Uint8Array,
  size: RequestedSize,
): Promise<Uint8Array<ArrayBuffer>> {
  const output = await sharp(bytes)
    .resize({
      ...(size.width !== undefined ? { width: size.width } : {}),
      ...(size.height !== undefined ? { height: size.height } : {}),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  // A Node Buffer can be a view into a shared pool, which is neither a valid
  // Response body to the type checker nor something to hand out by reference.
  // Copy into a buffer that owns its memory.
  const owned = new Uint8Array(output.byteLength);
  owned.set(output);
  return owned;
}
