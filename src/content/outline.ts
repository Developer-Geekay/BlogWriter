/**
 * The "on this page" outline for an entry.
 *
 * Derived from the Markdown body at render time rather than stored: the body is
 * the only source of truth for its own headings, and anything cached alongside
 * it would go stale the first time a post is edited — including edits made by an
 * AI client over MCP, which never touches a stored outline.
 */

export interface OutlineEntry {
  /** The heading text as written. */
  text: string;
  /** `id` to link to, matching what the renderer puts on the heading. */
  id: string;
  /** 2 or 3 — deeper headings are not shown. */
  level: 2 | 3;
}

/**
 * Anchor id for a heading.
 *
 * Deliberately not the post slugifier: that one throws on text with no
 * slug-safe characters and truncates to the blog API's length limit, neither of
 * which is right for an in-page anchor. A heading that reduces to nothing gets
 * a positional fallback from the caller.
 */
export function headingId(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pull `##` and `###` headings out of a Markdown body.
 *
 * Fenced blocks are skipped: a shell comment inside a fence starts with `#` and
 * would otherwise turn up in the outline as a heading.
 */
export function extractOutline(body: string): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  let inFence = false;

  body.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (!match) return;

    const text = match[2]!.trim();
    if (!text) return;

    out.push({
      text,
      id: headingId(text) || `section-${index}`,
      level: match[1]!.length === 2 ? 2 : 3,
    });
  });

  return out;
}
