import { afterEach, describe, expect, it } from 'vitest';
import { MediaError, assertSafeKey, buildKey, mediaConfig } from '../src/media/store.js';

describe('assertSafeKey', () => {
  it('accepts the keys this app generates', () => {
    expect(() => assertSafeKey('2026/09/1a2b3c4d-diagram.png')).not.toThrow();
  });

  it('refuses traversal', () => {
    // The key comes off the URL on the read path, so this is the guard that
    // stops a request reaching outside the intended prefix.
    expect(() => assertSafeKey('../secrets.env')).toThrow(MediaError);
    expect(() => assertSafeKey('2026/../../etc/passwd')).toThrow(MediaError);
  });

  it('refuses an absolute or doubled path', () => {
    expect(() => assertSafeKey('/etc/passwd')).toThrow(MediaError);
    expect(() => assertSafeKey('a//b')).toThrow(MediaError);
  });

  it('refuses an empty key and an absurdly long one', () => {
    expect(() => assertSafeKey('')).toThrow(MediaError);
    expect(() => assertSafeKey('a'.repeat(513))).toThrow(MediaError);
  });

  it('refuses characters outside the allow-list', () => {
    expect(() => assertSafeKey('file name.png')).toThrow(MediaError);
    expect(() => assertSafeKey('file<script>.png')).toThrow(MediaError);
    expect(() => assertSafeKey('café.png')).toThrow(MediaError);
  });
});

describe('buildKey', () => {
  it('files under a dated prefix', () => {
    expect(buildKey('diagram.png')).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{8}-diagram\.png$/);
  });

  it('produces a key that passes its own validator', () => {
    // The two have to agree, or an upload would succeed and then be unreadable.
    for (const name of ['My Photo (1).JPG', 'çafé.png', '...', 'a'.repeat(300) + '.png']) {
      expect(() => assertSafeKey(buildKey(name))).not.toThrow();
    }
  });

  it('never collides for the same filename', () => {
    expect(buildKey('cover.png')).not.toBe(buildKey('cover.png'));
  });

  it('falls back to a stem when the name has nothing usable', () => {
    expect(buildKey('!!!')).toMatch(/-file$/);
  });
});

describe('mediaConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is null unless bucket and both credentials are set', () => {
    delete process.env['S3_BUCKET'];
    delete process.env['S3_ACCESS_KEY_ID'];
    delete process.env['S3_SECRET_ACCESS_KEY'];
    expect(mediaConfig()).toBeNull();

    process.env['S3_BUCKET'] = 'b';
    expect(mediaConfig()).toBeNull();
  });

  it('forces path style when a custom endpoint is set', () => {
    process.env['S3_BUCKET'] = 'b';
    process.env['S3_ACCESS_KEY_ID'] = 'k';
    process.env['S3_SECRET_ACCESS_KEY'] = 's';
    process.env['S3_ENDPOINT'] = 'http://127.0.0.1:9000';
    delete process.env['S3_FORCE_PATH_STYLE'];
    // MinIO cannot serve the bucket as a subdomain, so this default is what
    // makes a local setup work without extra configuration.
    expect(mediaConfig()?.forcePathStyle).toBe(true);
  });

  it('leaves path style off for real S3, and lets it be overridden', () => {
    process.env['S3_BUCKET'] = 'b';
    process.env['S3_ACCESS_KEY_ID'] = 'k';
    process.env['S3_SECRET_ACCESS_KEY'] = 's';
    delete process.env['S3_ENDPOINT'];
    delete process.env['S3_FORCE_PATH_STYLE'];
    expect(mediaConfig()?.forcePathStyle).toBe(false);

    process.env['S3_ENDPOINT'] = 'http://127.0.0.1:9000';
    process.env['S3_FORCE_PATH_STYLE'] = 'false';
    expect(mediaConfig()?.forcePathStyle).toBe(false);
  });
});
