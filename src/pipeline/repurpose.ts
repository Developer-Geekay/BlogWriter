import type { Post } from '../store/post.js';
import type { LlmClient, Usage } from '../llm/client.js';
import type { AppConfig } from '../config/schema.js';
import type { Logger } from '../util/log.js';

export interface RepurposeResult {
  linkedinText: string;
  usage: Usage;
}

/**
 * Convert a blog post into a LinkedIn variant.
 *
 * LinkedIn posts are ~1300 chars max. The strategy is:
 * - Lead with the most attention-grabbing hook (max 280 chars, fits a preview)
 * - Add 1-3 key insights
 * - Add a call-to-action / invitation
 * - Link goes in the first comment (LinkedIn suppresses reach on posts with links)
 *
 * The LLM does the work; we validate length, escape reserved characters, and
 * structure it for the comment-based link.
 */
export async function repurposeToLinkedIn(
  post: Post,
  opts: { config: AppConfig; llm: LlmClient; log: Logger },
): Promise<RepurposeResult> {
  const maxChars = opts.config.profile.linkedin.maxChars;

  opts.log.info(`Converting to LinkedIn (~${maxChars} chars)...`);

  const systemPrompt = buildSystemPrompt(opts.config, maxChars);
  const userPrompt = buildUserPrompt(post, opts.config);

  const { text, usage } = await opts.llm.complete({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: opts.config.model.maxTokens,
    effort: opts.config.model.effort.repurpose ?? 'medium',
  });

  let linkedinText = text;

  // Validate and warn if close to limit
  if (linkedinText.length > maxChars) {
    opts.log.warn(
      `LinkedIn text exceeds ${maxChars} chars (${linkedinText.length}). ` +
        `Will be truncated on post. Edit before publishing.`,
    );
    linkedinText = linkedinText.slice(0, maxChars);
  }

  return { linkedinText, usage };
}

function buildSystemPrompt(config: AppConfig, maxChars: number): string {
  const maxHashtags = config.profile.linkedin.maxHashtags;

  return `You are a LinkedIn content specialist. Convert blog posts into engaging, platform-optimized LinkedIn posts.

## Guidelines

- Total length: ${maxChars} characters maximum (this is strict — the platform will truncate)
- Open with a hook (max 280 chars) that captures attention and fits a mobile preview
- Follow with 2–4 key insights or takeaways in short, scannable paragraphs
- End with a question or call-to-action to invite discussion
- Use line breaks liberally for readability
- Hashtags: up to ${maxHashtags} relevant tags at the end
- NO links in the post body — the blog link goes in the first comment
- Avoid LinkedIn-unfriendly markup: keep formatting simple

## Voice
${config.profile.voice.description}

### Do:
${config.profile.voice.do.map((d) => `- ${d}`).join('\n')}

### Don't:
${config.profile.voice.dont.map((d) => `- ${d}`).join('\n')}`;
}

function buildUserPrompt(post: Post, config: AppConfig): string {
  const title = post.frontmatter.title;
  const body = post.body;
  const baseUrl = config.website.baseUrl;
  const blogPath = config.website.blogPath ?? '/blog';
  const slug = post.frontmatter.slug;
  const postLink = `${baseUrl.replace(/\/+$/, '')}${blogPath.replace(/^\/+/, '/')}/${slug}`;

  return `Convert this blog post into a LinkedIn post (the link will go in a comment):

Title: ${title}

Body:
${body}

Blog URL for the comment: ${postLink}

Respond with ONLY the LinkedIn post text, no preamble or explanation.`;
}
