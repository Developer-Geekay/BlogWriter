import type { LinkedInConfig } from '../config/schema.js';
import { PublishError, requestJson } from './types.js';

const TARGET = 'linkedin';
const API_BASE = 'https://api.linkedin.com';

export interface LinkedInCredentials {
  accessToken: string;
  /** `urn:li:person:{sub}` — captured during `linkedin:auth`. */
  personUrn: string;
}

export type Visibility = 'PUBLIC' | 'CONNECTIONS';

/**
 * Characters LinkedIn's "Little Text" format treats as markup in the
 * `commentary` field. They must be backslash-escaped or the post is rejected
 * or renders mangled.
 *
 * Backslash is escaped first — otherwise escaping the others would double-escape
 * the backslashes we just added.
 */
const RESERVED = ['\\', '|', '{', '}', '@', '[', ']', '(', ')', '<', '>', '#', '*', '_', '~'];

export function escapeCommentary(text: string): string {
  let out = text;
  for (const char of RESERVED) {
    out = out.split(char).join(`\\${char}`);
  }
  return out;
}

/**
 * Publisher for a LinkedIn personal profile.
 *
 * Unlike the blog API, LinkedIn is **not** idempotent — posting twice creates
 * two posts. The caller must guard on a stored post URN; this class will
 * happily post again if asked.
 */
export class LinkedInPublisher {
  constructor(
    private readonly config: LinkedInConfig,
    private readonly credentials: LinkedInCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'LinkedIn-Version': this.config.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  /**
   * Publish a text post.
   *
   * Returns the post URN from the `x-restli-id` response header — the value the
   * caller must persist to prevent a duplicate post on retry.
   */
  async post(
    text: string,
    { visibility = 'PUBLIC', imageUrn }: { visibility?: Visibility; imageUrn?: string } = {},
  ): Promise<string> {
    const body: Record<string, unknown> = {
      author: this.credentials.personUrn,
      commentary: escapeCommentary(text),
      visibility,
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    if (imageUrn) {
      body['content'] = { media: { id: imageUrn } };
    }

    const { response } = await requestJson<unknown>(`${API_BASE}/rest/posts`, {
      target: TARGET,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      fetchImpl: this.fetchImpl,
    });

    const urn = response.headers.get('x-restli-id');
    if (!urn) {
      throw new PublishError(
        TARGET,
        'LinkedIn accepted the post but returned no x-restli-id header, so we cannot record ' +
          'the post URN. Check your feed before retrying — retrying may double-post.',
      );
    }
    return urn;
  }

  /**
   * Add a comment to a post and return the comment URN.
   *
   * Used to put the blog link in the first comment: LinkedIn suppresses reach on
   * posts containing outbound links, so the link goes here instead of in the body.
   */
  async comment(postUrn: string, text: string): Promise<string> {
    const encoded = encodeURIComponent(postUrn);
    const { response } = await requestJson(`${API_BASE}/rest/socialActions/${encoded}/comments`, {
      target: TARGET,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        actor: this.credentials.personUrn,
        object: postUrn,
        message: { text },
      }),
      fetchImpl: this.fetchImpl,
    });

    const urn = response.headers.get('x-restli-id');
    if (!urn) {
      throw new PublishError(
        TARGET,
        'LinkedIn accepted the comment but returned no x-restli-id header.',
      );
    }
    return urn;
  }

  /** Upload an image and return its URN, ready to attach to a post. */
  async uploadImage(bytes: Uint8Array, contentType = 'image/png'): Promise<string> {
    const { data } = await requestJson<{
      value: { uploadUrl: string; image: string };
    }>(`${API_BASE}/rest/images?action=initializeUpload`, {
      target: TARGET,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        initializeUploadRequest: { owner: this.credentials.personUrn },
      }),
      fetchImpl: this.fetchImpl,
    });

    const upload = await this.fetchImpl(data.value.uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': contentType,
      },
      body: bytes,
    });

    if (!upload.ok) {
      throw new PublishError(TARGET, `Image upload failed: ${upload.status}`, upload.status);
    }
    return data.value.image;
  }

  /** Confirm the token works and matches the configured person. */
  async verifyCredentials(): Promise<{ sub: string; name?: string }> {
    const { data } = await requestJson<{ sub: string; name?: string }>(
      `${API_BASE}/v2/userinfo`,
      {
        target: TARGET,
        method: 'GET',
        headers: { Authorization: `Bearer ${this.credentials.accessToken}` },
        fetchImpl: this.fetchImpl,
      },
      { retries: 0 },
    );
    return data;
  }
}
