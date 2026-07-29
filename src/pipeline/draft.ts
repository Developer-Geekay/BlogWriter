import type { AppConfig } from '../config/schema.js';
import { LlmClient, addUsage, emptyUsage, type Usage } from '../llm/client.js';
import {
  METADATA_SCHEMA,
  VERIFY_SCHEMA,
  draftPrompt,
  editPrompt,
  metadataPrompt,
  researchPrompt,
  systemPrompt,
  verifyPrompt,
} from '../llm/prompts.js';
import { newFrontmatter, type PostRepository } from '../store/repository.js';
import type { Post, Source } from '../store/post.js';
import type { Logger } from '../util/log.js';

export interface DraftOptions {
  topic: string;
  slug?: string;
  /** Skip the web research stage — faster and cheaper for opinion pieces. */
  skipResearch?: boolean;
}

export interface DraftOutcome {
  post: Post;
  path: string;
  usage: Usage;
}

/**
 * research → draft → edit → verify → metadata.
 *
 * The verify pass runs in a fresh context deliberately: asking a model to
 * re-check its own reasoning inside the same conversation is measurably weaker
 * than handing the finished text to a caller that has never seen the draft
 * being written.
 */
export async function draftPost(
  options: DraftOptions,
  deps: { config: AppConfig; llm: LlmClient; repo: PostRepository; log: Logger },
): Promise<DraftOutcome> {
  const { config, llm, repo, log } = deps;
  const system = systemPrompt(config.profile);
  let usage = emptyUsage();

  let notes = '';
  let sources: Source[] = [];

  if (options.skipResearch) {
    log.step('research', 'skipped (--no-research)');
  } else {
    log.step('research', 'searching the web');
    const research = await llm.complete({
      system,
      user: researchPrompt(options.topic, config.topics.avoid),
      effort: config.model.effort.research,
      search: true,
      maxTokens: 16000,
    });
    notes = research.text;
    sources = research.sources;
    usage = addUsage(usage, research.usage);
    log.detail(`${sources.length} source${sources.length === 1 ? '' : 's'} gathered`);
  }

  log.step('draft', `writing ${config.profile.post.minWords}–${config.profile.post.maxWords} words`);
  const drafted = await llm.complete({
    system,
    user: draftPrompt({ topic: options.topic, notes, sources, profile: config.profile }),
    effort: config.model.effort.draft,
  });
  usage = addUsage(usage, drafted.usage);

  log.step('edit', 'revision pass');
  const edited = await llm.complete({
    system,
    user: editPrompt(drafted.text, sources),
    effort: config.model.effort.edit,
  });
  usage = addUsage(usage, edited.usage);
  const body = edited.text;

  log.step('verify', 'fact-checking against sources');
  const verified = await llm.json<{ unsupportedClaims: string[] }>({
    system,
    user: verifyPrompt(body, sources),
    effort: config.model.effort.verify,
    jsonSchema: VERIFY_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
  });
  usage = addUsage(usage, verified.usage);
  const unsupportedClaims = verified.value.unsupportedClaims ?? [];
  if (unsupportedClaims.length) {
    log.warn(`${unsupportedClaims.length} unsupported claim(s) flagged for your review`);
  } else {
    log.detail('no unsupported claims');
  }

  log.step('metadata', 'title, excerpt, tags');
  const meta = await llm.json<{ title: string; excerpt: string; tags: string[] }>({
    system,
    user: metadataPrompt(body, config.profile),
    effort: config.model.effort.metadata,
    jsonSchema: METADATA_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
  });
  usage = addUsage(usage, meta.usage);

  const slug = await repo.allocateSlug(meta.value.title, options.slug);
  const frontmatter = newFrontmatter({
    slug,
    title: meta.value.title,
    topic: options.topic,
    status: 'drafted',
  });

  const post: Post = {
    frontmatter: {
      ...frontmatter,
      excerpt: meta.value.excerpt,
      tags: meta.value.tags.length ? meta.value.tags : config.profile.post.defaultTags,
      sources,
      unsupportedClaims,
    },
    body,
  };

  const path = await repo.write(post);
  return { post, path, usage };
}
