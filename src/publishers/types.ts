/** Outcome of a publish attempt against one target. */
export interface PublishResult {
  /** Whether anything was actually sent (false when skipped or dry-run). */
  performed: boolean;
  /** Public URL, once known. */
  url?: string | null;
  /** Opaque provider identifier — LinkedIn's post URN. */
  id?: string | null;
  /** Human-readable summary for the CLI and PR body. */
  detail: string;
}

export class PublishError extends Error {
  constructor(
    readonly target: string,
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

/**
 * Shared HTTP helper.
 *
 * Retries only on transport errors and 5xx/429 — never on a 4xx, which means
 * the request itself is wrong and retrying just repeats it.
 */
export async function requestJson<T>(
  url: string,
  init: RequestInit & { target: string; fetchImpl?: typeof fetch },
  { retries = 2 }: { retries?: number } = {},
): Promise<{ data: T; response: Response }> {
  const { target, fetchImpl = fetch, ...requestInit } = init;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, requestInit);
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        await sleep(2 ** attempt * 1000);
        continue;
      }
      throw new PublishError(target, `Network error calling ${url}: ${lastError.message}`, undefined, true);
    }

    if (response.ok) {
      const text = await response.text();
      const data = text ? (safeJsonParse(text) as T) : ({} as T);
      return { data, response };
    }

    const body = await response.text().catch(() => '');
    const message = extractMessage(body) ?? body.slice(0, 300) ?? response.statusText;
    const retryable = response.status >= 500 || response.status === 429;

    if (retryable && attempt < retries) {
      await sleep(2 ** attempt * 1000);
      continue;
    }

    throw new PublishError(
      target,
      `${response.status} from ${url}: ${message}`,
      response.status,
      retryable,
    );
  }

  throw new PublishError(target, `Exhausted retries calling ${url}`, undefined, true);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: string; error_description?: string };
    return parsed.message ?? parsed.error_description ?? null;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
