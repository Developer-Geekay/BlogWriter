import type { Post } from '../store/post.js';
import type { PostRepository } from '../store/repository.js';
import type { LlmClient, Usage } from '../llm/client.js';
import type { AppConfig } from '../config/schema.js';
import type { Logger } from '../util/log.js';
import { WebsitePublisher } from '../publishers/website.js';
import { LinkedInPublisher } from '../publishers/linkedin.js';
import { escapeCommentary } from '../publishers/linkedin.js';
import { repurposeToLinkedIn } from './repurpose.js';

export interface PublishResult {
  websiteUrl: string;
  linkedinPostUrn?: string;
  linkedinCommentUrn?: string;
  usage: Usage;
}

/**
 * Publish orchestrator: coordinate website + LinkedIn publishing and write back
 * status and URLs to frontmatter.
 *
 * The workflow:
 * 1. Upsert to website (blog API) — idempotent, so safe to retry
 * 2. Repurpose post to LinkedIn (~1300 chars, optimized for the platform)
 * 3. Post to LinkedIn personal profile
 * 4. Add blog link as first comment (LinkedIn suppresses reach on links in body)
 * 5. Update frontmatter with URLs, URNs, timestamps
 * 6. Write updated post back to store
 *
 * If LinkedIn publishing fails partway through (e.g., post created but comment
 * fails), the caller should handle retry logic — the post URN is in frontmatter.
 */
export async function publishPost(
  post: Post,
  opts: {
    config: AppConfig;
    llm: LlmClient;
    repo: PostRepository;
    log: Logger;
    websitePublisher: WebsitePublisher;
    linkedinPublisher?: LinkedInPublisher;
    skipLinkedIn?: boolean;
  },
): Promise<PublishResult> {
  const { config, llm, repo, log, websitePublisher, linkedinPublisher, skipLinkedIn } = opts;

  if (post.frontmatter.status !== 'approved') {
    throw new Error(`Cannot publish post with status "${post.frontmatter.status}" — must be approved`);
  }

  log.heading(`Publishing: ${post.frontmatter.title}`);

  // Step 1: Upsert to website
  log.info('→ Publishing to website...');
  const websiteUrl = await websitePublisher.upsert(post, { published: true });
  log.success(`✓ Website: ${websiteUrl}`);

  let linkedinPostUrn: string | undefined;
  let linkedinCommentUrn: string | undefined;
  let repurposeUsage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  // Step 2-5: LinkedIn publishing
  if (!skipLinkedIn && linkedinPublisher) {
    // Step 2: Repurpose to LinkedIn
    log.info('→ Repurposing to LinkedIn...');
    const { linkedinText, usage } = await repurposeToLinkedIn(post, { config, llm, log });
    repurposeUsage = usage;
    log.info(`✓ Repurposed (${linkedinText.length} / ${config.profile.linkedin.maxChars} chars)`);

    // Step 3: Post to LinkedIn
    log.info('→ Posting to LinkedIn...');
    const visibility = config.linkedin.visibility;
    linkedinPostUrn = await linkedinPublisher.post(linkedinText, { visibility });
    log.success(`✓ LinkedIn post: ${linkedinPostUrn}`);

    // Step 4: Add blog link as comment
    log.info('→ Adding blog link to comment...');
    const commentText = `Read the full post: ${websiteUrl}`;
    const escapedComment = escapeCommentary(commentText);
    linkedinCommentUrn = await linkedinPublisher.comment(linkedinPostUrn, escapedComment);
    log.success('✓ Comment added');
  }

  // Step 5: Update frontmatter
  log.info('→ Updating frontmatter...');
  await repo.update(post.frontmatter.slug, (p) => {
    p.frontmatter.status = 'published';
    p.frontmatter.website.status = 'published';
    p.frontmatter.website.url = websiteUrl;
    p.frontmatter.website.publishedAt = new Date().toISOString();

    if (linkedinPostUrn) {
      p.frontmatter.linkedin.status = 'published';
      p.frontmatter.linkedin.postUrn = linkedinPostUrn;
      p.frontmatter.linkedin.commentUrn = linkedinCommentUrn ?? null;
      p.frontmatter.linkedin.publishedAt = new Date().toISOString();
    }

    return p;
  });
  log.success('✓ Frontmatter updated');

  return {
    websiteUrl,
    linkedinPostUrn,
    linkedinCommentUrn,
    usage: repurposeUsage,
  };
}
