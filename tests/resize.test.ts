import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { isResizable, parseSize, resizeImage } from '../src/media/resize.js';

const size = (query: string) => parseSize(new URLSearchParams(query));

describe('parseSize', () => {
  it('is null when no dimension was asked for, so the caller can stream instead', () => {
    expect(size('')).toBeNull();
    expect(size('foo=bar')).toBeNull();
  });

  it('reads w and h', () => {
    expect(size('w=600')).toEqual({ width: 600 });
    expect(size('h=400')).toEqual({ height: 400 });
    expect(size('w=600&h=400')).toEqual({ width: 600, height: 400 });
  });

  it('ignores garbage rather than rejecting it', () => {
    // These URLs live inside published posts. A typo should render the image at
    // full size, not a broken icon.
    for (const q of ['w=abc', 'w=', 'w=-5', 'w=0', 'w=6.5', 'w=NaN', 'w=Infinity']) {
      expect(size(q), q).toBeNull();
    }
  });

  it('clamps rather than allocating whatever was asked for', () => {
    expect(size('w=99999')).toEqual({ width: 4000 });
    expect(size('w=1')).toEqual({ width: 16 });
  });

  it('keeps a valid dimension when the other one is garbage', () => {
    expect(size('w=600&h=abc')).toEqual({ width: 600 });
  });
});

describe('isResizable', () => {
  it('accepts the formats uploads allow', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/avif']) {
      expect(isResizable(type), type).toBe(true);
    }
  });

  it('leaves alone what it would damage or cannot improve', () => {
    // GIF would lose its animation, SVG is already resolution-independent, and
    // the bucket also holds PDFs.
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain']) {
      expect(isResizable(type), type).toBe(false);
    }
  });

  it('copes with a charset parameter on the header', () => {
    expect(isResizable('image/png; charset=binary')).toBe(true);
  });
});

/** A real PNG, so the resize is exercised rather than mocked. */
async function png(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 10 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('resizeImage', () => {
  it('scales down to the requested width and keeps the aspect ratio', async () => {
    const out = await resizeImage(await png(1200, 600), { width: 300 });
    const meta = await sharp(out).metadata();

    expect(meta.width).toBe(300);
    expect(meta.height).toBe(150);
  });

  it('never enlarges', async () => {
    // Asking for a generous width should not blur a small screenshot, so an
    // author can write ?w=1200 without knowing what they uploaded.
    const out = await resizeImage(await png(400, 200), { width: 1200 });
    const meta = await sharp(out).metadata();

    expect(meta.width).toBe(400);
  });

  it('treats width and height as a bounding box, never distorting', async () => {
    const out = await resizeImage(await png(1000, 500), { width: 400, height: 400 });
    const meta = await sharp(out).metadata();

    // Fits inside 400x400 at the original 2:1, rather than squashing to square.
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(200);
  });

  it('preserves the format, so the proxy can keep the original content type', async () => {
    const out = await resizeImage(await png(800, 400), { width: 200 });
    expect((await sharp(out).metadata()).format).toBe('png');
  });

  it('actually makes the file smaller, which is the whole point', async () => {
    const original = await png(2000, 1000);
    const out = await resizeImage(original, { width: 400 });

    expect(out.byteLength).toBeLessThan(original.byteLength);
  });

  it('returns a buffer that owns its memory and can be a Response body', async () => {
    const out = await resizeImage(await png(100, 100), { width: 50 });
    // A pooled Node Buffer would be a view into a larger slab.
    expect(out.byteOffset).toBe(0);
    expect(out.buffer.byteLength).toBe(out.byteLength);
    expect(() => new Response(out)).not.toThrow();
  });
});
