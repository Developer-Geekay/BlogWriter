import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Object storage for uploaded media.
 *
 * S3-compatible rather than S3-specific: the endpoint is configurable and path
 * style is forced by default, which is what a local MinIO needs. The same code
 * runs against real S3 by leaving `S3_ENDPOINT` unset.
 *
 * Credentials come from the environment and never from source. There is no
 * fallback — an unconfigured deployment has no media library rather than a
 * half-working one pointed at someone else's bucket.
 */
export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

export interface MediaConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Null when media is not configured, so callers can say so instead of failing. */
export function mediaConfig(): MediaConfig | null {
  const bucket = process.env['S3_BUCKET']?.trim();
  const accessKeyId = process.env['S3_ACCESS_KEY_ID']?.trim();
  const secretAccessKey = process.env['S3_SECRET_ACCESS_KEY']?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  const endpoint = process.env['S3_ENDPOINT']?.trim() || undefined;
  return {
    bucket,
    region: process.env['S3_REGION']?.trim() || 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
    // MinIO and most self-hosted gateways cannot do virtual-host style, where
    // the bucket becomes a subdomain. Default it on whenever a custom endpoint
    // is set, which is exactly when that is true.
    forcePathStyle: (process.env['S3_FORCE_PATH_STYLE'] ?? String(Boolean(endpoint))) !== 'false',
    accessKeyId,
    secretAccessKey,
  };
}

export interface MediaObject {
  key: string;
  size: number;
  lastModified: string | null;
}

/**
 * Reject anything that could escape the bucket prefix or confuse a path.
 *
 * The key arrives from a URL, so it is attacker-controlled on the read path.
 * An allow-list rather than a deny-list: object stores accept far stranger keys
 * than this app ever creates, and there is no reason to serve them.
 */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 512) throw new MediaError('Invalid media key.');
  if (key.startsWith('/') || key.includes('..') || key.includes('//')) {
    throw new MediaError('Invalid media key.');
  }
  if (!/^[A-Za-z0-9!_.*'()/-]+$/.test(key)) throw new MediaError('Invalid media key.');
}

/**
 * Where an upload lands.
 *
 * Dated prefix so the bucket stays browsable as it grows, and a random segment
 * so re-uploading a file called `screenshot.png` never overwrites the last one.
 */
export function buildKey(filename: string): string {
  const now = new Date();
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    // Collapse dot runs and trim them off the ends. Without this a file called
    // `...` — or anything leaving two dots adjacent — builds a key containing
    // `..`, which `assertSafeKey` then refuses, so the upload would fail on a
    // key this function had just produced.
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(-80)
    .replace(/^[.-]+/, '');
  const stem = safe || 'file';
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID().slice(0, 8)}-${stem}`;
}

export class MediaStore {
  private constructor(
    private readonly client: S3Client,
    readonly bucket: string,
  ) {}

  static open(config = mediaConfig()): MediaStore {
    if (!config) {
      throw new MediaError(
        'Object storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID and ' +
          'S3_SECRET_ACCESS_KEY in .env — see .env.example.',
      );
    }

    const client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    /*
     * Strip the trailing slash from bucket-level requests.
     *
     * For a path-style list the SDK builds `/{bucket}/`. Real S3 and MinIO
     * treat that as the bucket; stricter S3-compatible implementations read the
     * empty segment after the slash as an object key and answer 404 NoSuchKey —
     * which is what a list against this deployment's gateway does. Removing the
     * slash makes the same request succeed.
     *
     * Scoped by a regex that matches only `/{something}/` with nothing after
     * it, so it can never touch a real object key. The rewrite happens in the
     * `build` step, before `finalizeRequest` signs the request, so the
     * signature covers the path actually sent.
     */
    client.middlewareStack.add(
      (next) => async (args) => {
        const request = args.request as { path?: string };
        if (request?.path && /^\/[^/]+\/$/.test(request.path)) {
          request.path = request.path.replace(/\/$/, '');
        }
        return next(args);
      },
      { step: 'build', name: 'stripBucketTrailingSlash' },
    );

    return new MediaStore(client, config.bucket);
  }

  async list(limit = 200): Promise<MediaObject[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: limit }),
    );
    return (res.Contents ?? [])
      .filter((o): o is typeof o & { Key: string } => Boolean(o.Key))
      // Newest first — an upload should appear at the top of the grid, and the
      // API returns keys in lexicographic order, which the dated prefix makes
      // oldest-first.
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
      .map((o) => ({
        key: o.Key,
        size: o.Size ?? 0,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
      }));
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** The object as a web stream, for the proxy route to pipe straight through. */
  async get(key: string): Promise<{
    body: ReadableStream;
    contentType: string;
    contentLength?: number;
  } | null> {
    assertSafeKey(key);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      return {
        body: res.Body.transformToWebStream(),
        contentType: res.ContentType ?? 'application/octet-stream',
        ...(res.ContentLength !== undefined ? { contentLength: res.ContentLength } : {}),
      };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw err;
    }
  }
}

/** Turn a storage failure into something a route can report as 503. */
export function asMediaError(err: unknown): MediaError {
  if (err instanceof MediaError) return err;
  const message = (err as Error)?.message ?? String(err);
  return new MediaError(`Object storage is unavailable: ${message}`);
}
