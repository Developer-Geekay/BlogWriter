import type { Profile } from '../config/schema.js';
import type { Source } from '../store/post.js';

/**
 * The shared system prompt. Byte-identical across every call in a run so it
 * sits behind the prompt-cache breakpoint — which is also why per-call detail
 * belongs in the user turn, not here.
 */
export function systemPrompt(profile: Profile): string {
  const lines: string[] = [
    `You are a writing partner for ${profile.author.name}, drafting posts published under their name at ${profile.author.site}.`,
    '',
    `## Audience`,
    profile.audience,
    '',
    `## Voice`,
    profile.voice.description,
  ];

  if (profile.voice.do.length) {
    lines.push('', 'Do:', ...profile.voice.do.map((d) => `- ${d}`));
  }
  if (profile.voice.dont.length) {
    lines.push('', 'Never:', ...profile.voice.dont.map((d) => `- ${d}`));
  }
  if (profile.bannedPhrases.length) {
    lines.push(
      '',
      '## Banned phrases',
      'These read as machine-written. Never use them or close variants:',
      ...profile.bannedPhrases.map((p) => `- "${p}"`),
    );
  }
  if (profile.voice.samples.length) {
    lines.push(
      '',
      '## Voice samples',
      'Writing by this author. Match the rhythm, sentence length, and level of directness — not the topics.',
      ...profile.voice.samples.map((s, i) => `\n### Sample ${i + 1}\n${s}`),
    );
  }

  lines.push(
    '',
    '## Standing rules',
    '- Every factual claim, statistic, version number, or quote must come from a provided source. If you cannot source it, cut the claim rather than softening it into a vaguer one.',
    '- Write prose, not listicles. Use a list when the content is genuinely a list of parallel items, not to break up text.',
    '- No filler openings ("In today\'s fast-paced world"), no summary paragraph that restates what was just said.',
    '- Lead with the specific and concrete. If a sentence would survive being pasted into an unrelated post, delete it.',
  );

  return lines.join('\n');
}

export function researchPrompt(topic: string, avoid: string[]): string {
  return [
    `Research this topic so it can be written about accurately: "${topic}"`,
    '',
    'Search the web for current, primary information. Prioritise official documentation, release notes, specs, and first-hand engineering writeups over listicles and content-marketing posts.',
    '',
    'Return notes in Markdown covering:',
    '- What is actually true right now, with specifics (versions, dates, numbers, names)',
    '- Points where sources disagree, or where something commonly repeated is outdated or wrong',
    '- Concrete details worth using: real API shapes, real error messages, real tradeoffs',
    '- What is NOT worth saying because it is obvious or covered everywhere else',
    '',
    'Do not write the post. These are notes for a writer.',
    avoid.length ? `\nAvoid these angles, they have been covered already:\n${avoid.map((a) => `- ${a}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function draftPrompt(args: {
  topic: string;
  notes: string;
  sources: Source[];
  profile: Profile;
}): string {
  const { topic, notes, sources, profile } = args;
  return [
    `Write a blog post on: "${topic}"`,
    '',
    `Target length: ${profile.post.minWords}–${profile.post.maxWords} words.`,
    '',
    '## Research notes',
    notes,
    '',
    '## Sources you may cite',
    sources.length
      ? sources.map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`).join('\n')
      : '(No sources were gathered. Write only what is true independent of current specifics, and avoid version numbers, statistics, and dated claims entirely.)',
    '',
    '## Output format',
    'Return the post body as Markdown, and nothing else — no front matter, no title heading (the title is stored separately), no commentary before or after.',
    'Start with the opening paragraph. Use `##` for section headings. Link to sources inline with normal Markdown links where a claim needs backing.',
  ].join('\n');
}

export function editPrompt(body: string, sources: Source[]): string {
  return [
    'Revise the draft below. You are a demanding editor, not a rewriter — keep the structure and the author\'s voice, and improve it in place.',
    '',
    'Fix:',
    '- Sentences that say nothing, hedge without reason, or restate the previous sentence',
    '- Claims that go further than the sources support',
    '- Generic openings and closings',
    '- Rhythm: too many sentences of the same length in a row',
    '',
    'Preserve: the argument, the structure, the specifics, all Markdown links.',
    '',
    '## Sources',
    sources.length ? sources.map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`).join('\n') : '(none)',
    '',
    '## Draft',
    body,
    '',
    '## Output format',
    'Return only the revised Markdown body. No commentary, no explanation of what you changed.',
  ].join('\n');
}

export function verifyPrompt(body: string, sources: Source[]): string {
  return [
    'Check the post below for claims that are not supported by the listed sources.',
    '',
    'Flag a claim when it states a specific fact — a number, date, version, benchmark, quote, or attribution — that no listed source establishes. Do not flag the author\'s opinions, arguments, recommendations, or general statements that need no citation.',
    '',
    '## Sources',
    sources.length ? sources.map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`).join('\n') : '(none — flag every specific factual claim)',
    '',
    '## Post',
    body,
  ].join('\n');
}

export const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    unsupportedClaims: {
      type: 'array',
      description: 'Claims not backed by any listed source. Empty if everything checks out.',
      items: {
        type: 'string',
        description: 'The claim, quoted from the post, plus a short note on what is missing.',
      },
    },
  },
  required: ['unsupportedClaims'],
  additionalProperties: false,
} as const;

export function metadataPrompt(body: string, profile: Profile): string {
  return [
    'Produce publication metadata for this post.',
    '',
    `- title: specific and concrete. No colons-with-subtitle, no "A Guide to", no clickbait. Under 70 characters.`,
    `- excerpt: one or two sentences that make a reader want the post, stating what it actually covers. Under 200 characters.`,
    `- tags: 2–5 lowercase topic tags.${profile.post.defaultTags.length ? ` Prefer reusing existing tags where they fit: ${profile.post.defaultTags.join(', ')}.` : ''}`,
    '',
    '## Post',
    body,
  ].join('\n');
}

export const METADATA_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    excerpt: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'excerpt', 'tags'],
  additionalProperties: false,
} as const;
