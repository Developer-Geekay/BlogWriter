import Anthropic from '@anthropic-ai/sdk';
import type { ModelConfig } from '../config/schema.js';
import type { Source } from '../store/post.js';

/** Claude Opus 5 list pricing, USD per million tokens. */
const PRICE_PER_MTOK = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 } as const;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmResult {
  text: string;
  sources: Source[];
  usage: Usage;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CallOptions {
  /** Stable across calls — placed behind the prompt-cache breakpoint. */
  system: string;
  user: string;
  effort: Effort;
  maxTokens?: number;
  /** Enable the server-side web search tool for this call. */
  search?: boolean;
  /** Constrain the response to a JSON Schema. Incompatible with `search`. */
  jsonSchema?: Record<string, unknown>;
}

export class RefusalError extends Error {
  constructor(readonly category: string | null, explanation: string | null) {
    super(
      `Claude declined this request${category ? ` (${category})` : ''}` +
        (explanation ? `: ${explanation}` : '') +
        '. Rephrase the topic, or check config/topics.yml for anything that could read as sensitive.',
    );
    this.name = 'RefusalError';
  }
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export function estimateCostUsd(u: Usage): number {
  return (
    (u.inputTokens * PRICE_PER_MTOK.input +
      u.outputTokens * PRICE_PER_MTOK.output +
      u.cacheWriteTokens * PRICE_PER_MTOK.cacheWrite +
      u.cacheReadTokens * PRICE_PER_MTOK.cacheRead) /
    1_000_000
  );
}

/**
 * Thin wrapper over the Messages API that centralises the decisions we want
 * applied consistently: model + effort, adaptive thinking, prompt caching of
 * the system prompt, streaming (so long drafts don't hit HTTP timeouts), and
 * `pause_turn` resumption when the web search tool runs long.
 */
export class LlmClient {
  private readonly anthropic: Anthropic;
  private fallbackEnabled: boolean;

  constructor(
    private readonly config: ModelConfig,
    anthropic?: Anthropic,
  ) {
    this.anthropic = anthropic ?? new Anthropic();
    this.fallbackEnabled = config.refusalFallback;
  }

  async complete(options: CallOptions): Promise<LlmResult> {
    if (options.search && options.jsonSchema) {
      throw new Error('Structured output cannot be combined with web search — use two calls.');
    }

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: options.user }];
    let usage = emptyUsage();
    const sources: Source[] = [];
    const textParts: string[] = [];

    // Server-side tools can stop mid-task with `pause_turn`; resending the
    // conversation resumes it. Bounded so a pathological loop can't run away.
    for (let attempt = 0; attempt < 6; attempt++) {
      const message = await this.send(options, messages);
      usage = addUsage(usage, readUsage(message));

      if (message.stop_reason === 'refusal') {
        const details = (message as { stop_details?: { category?: string; explanation?: string } })
          .stop_details;
        throw new RefusalError(details?.category ?? null, details?.explanation ?? null);
      }

      for (const block of message.content) {
        if (block.type === 'text') textParts.push(block.text);
        else if (block.type === 'web_search_tool_result') sources.push(...extractSources(block));
      }

      if (message.stop_reason !== 'pause_turn') {
        if (message.stop_reason === 'max_tokens') {
          throw new Error(
            `Response hit the ${options.maxTokens ?? this.config.maxTokens} token limit and was ` +
              `truncated. Raise model.maxTokens in config/model.yml or narrow the topic.`,
          );
        }
        return { text: textParts.join('').trim(), sources: dedupeSources(sources), usage };
      }

      messages.push({ role: 'assistant', content: message.content });
    }

    throw new Error('Web search did not converge after 6 resumptions; aborting.');
  }

  /** Convenience wrapper for calls constrained to a JSON Schema. */
  async json<T>(options: CallOptions & { jsonSchema: Record<string, unknown> }): Promise<{
    value: T;
    usage: Usage;
  }> {
    const result = await this.complete(options);
    try {
      return { value: JSON.parse(result.text) as T, usage: result.usage };
    } catch {
      throw new Error(`Expected JSON from the model but got:\n${result.text.slice(0, 400)}`);
    }
  }

  private async send(
    options: CallOptions,
    messages: Anthropic.MessageParam[],
  ): Promise<Anthropic.Message> {
    const params: Record<string, unknown> = {
      model: this.config.id,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: options.effort,
        ...(options.jsonSchema ? { format: { type: 'json_schema', schema: options.jsonSchema } } : {}),
      },
      // The system prompt is identical across every call in a run, so caching
      // it turns repeat drafting into a ~10% charge on that prefix.
      system: [
        { type: 'text', text: options.system, cache_control: { type: 'ephemeral' } },
      ],
      messages,
      ...(options.search
        ? {
            tools: [
              {
                type: 'web_search_20260209',
                name: 'web_search',
                max_uses: this.config.maxSearches,
              },
            ],
          }
        : {}),
    };

    if (!this.fallbackEnabled) {
      return this.anthropic.messages.stream(params as never).finalMessage();
    }

    try {
      return (await this.anthropic.beta.messages
        .stream({
          ...params,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as never)
        .finalMessage()) as unknown as Anthropic.Message;
    } catch (err) {
      if (!isFallbackUnsupported(err)) throw err;
      // The account doesn't have the fallback beta. Drop it for the rest of the
      // run rather than failing the whole draft over an optional feature.
      this.fallbackEnabled = false;
      return this.anthropic.messages.stream(params as never).finalMessage();
    }
  }
}

function isFallbackUnsupported(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError) || err.status !== 400) return false;
  const message = String((err as { message?: string }).message ?? '').toLowerCase();
  return message.includes('fallback') || message.includes('beta');
}

function readUsage(message: Anthropic.Message): Usage {
  const u = message.usage as Anthropic.Usage & {
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Pull citations out of a web search result block.
 *
 * On success `block.content` is an array of results; on failure it is a single
 * error object (e.g. `{ error_code: "max_uses_exceeded" }`). A search failure
 * is not fatal — the draft simply proceeds with fewer sources, and the
 * fact-check pass will flag anything it can't support.
 */
function extractSources(block: { content?: unknown }): Source[] {
  if (!Array.isArray(block.content)) return [];
  const accessedAt = new Date().toISOString();

  return block.content
    .filter((r): r is { type: string; url: string; title?: string } =>
      Boolean(r && typeof r === 'object' && 'url' in r),
    )
    .map((r) => ({ url: r.url, title: r.title ?? '', accessedAt }));
}

function dedupeSources(sources: Source[]): Source[] {
  const byUrl = new Map<string, Source>();
  for (const s of sources) if (!byUrl.has(s.url)) byUrl.set(s.url, s);
  return [...byUrl.values()];
}
