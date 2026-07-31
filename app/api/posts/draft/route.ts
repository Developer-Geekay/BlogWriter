import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PostStore } from '@/src/db/posts';
import { requireSession } from '@/src/auth/guard';
import { loadConfig, ConfigError } from '@/src/config/load';
import { LlmClient, estimateCostUsd, RefusalError } from '@/src/llm/client';
import { composeDraft } from '@/src/pipeline/draft';
import { Logger } from '@/src/util/log';

export const runtime = 'nodejs';
// Research plus four model passes takes minutes, well past the default budget.
export const maxDuration = 800;

const DraftSchema = z.object({
  topic: z.string().trim().min(1, 'A topic is required.'),
  research: z.boolean().default(true),
});

/**
 * Run the research → draft → edit → fact-check → metadata pipeline and store
 * the result as a draft. Always a draft: generated copy goes in front of a human
 * before it goes in front of readers.
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const parsed = DraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  if (!process.env['ANTHROPIC_API_KEY']) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set, so AI drafting is unavailable.' },
      { status: 503 },
    );
  }

  try {
    const config = await loadConfig();
    const draft = await composeDraft(
      { topic: parsed.data.topic, skipResearch: !parsed.data.research },
      {
        config,
        llm: new LlmClient(config.model),
        // Progress goes to the server log, not the response body.
        log: new Logger(true, process.stderr),
      },
    );

    const post = await (await PostStore.open()).create({
      title: draft.title,
      body: draft.body,
      excerpt: draft.excerpt,
      tags: draft.tags,
      sources: draft.sources.map((s) => ({ url: s.url, title: s.title })),
      unsupportedClaims: draft.unsupportedClaims,
      status: 'draft',
      coverImage: null,
    });

    return NextResponse.json({
      post,
      estimatedCostUsd: Number(estimateCostUsd(draft.usage).toFixed(3)),
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      return NextResponse.json(
        { error: `The voice guide config is missing or invalid: ${err.message}` },
        { status: 503 },
      );
    }
    if (err instanceof RefusalError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
