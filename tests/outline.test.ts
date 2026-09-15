import { describe, expect, it } from 'vitest';
import { extractOutline, headingId } from '../src/content/outline.js';
import { entryNumber } from '../src/db/types.js';

describe('extractOutline', () => {
  it('picks up h2 and h3, and records their level', () => {
    const outline = extractOutline('## Bound the queue\n\ntext\n\n### A detail\n\n## Shed load');

    expect(outline.map((o) => [o.level, o.text])).toEqual([
      [2, 'Bound the queue'],
      [3, 'A detail'],
      [2, 'Shed load'],
    ]);
  });

  it('ignores the h1, which the page title already is', () => {
    expect(extractOutline('# Title\n\n## Real heading')).toHaveLength(1);
  });

  it('does not mistake a comment inside a fence for a heading', () => {
    const body = ['## Real', '', '```bash', '## not a heading', '# also not', '```', '', '## Also real'].join(
      '\n',
    );

    expect(extractOutline(body).map((o) => o.text)).toEqual(['Real', 'Also real']);
  });

  it('gives a positional id to a heading with nothing slug-safe in it', () => {
    // Without the fallback this would be an empty `id`, and two such headings
    // would collide on the same anchor.
    const [only] = extractOutline('## ✳✳✳');
    expect(only?.id).toBe('section-0');
  });

  it('strips trailing closing hashes', () => {
    expect(extractOutline('## Balanced ##')[0]?.text).toBe('Balanced');
  });
});

describe('headingId', () => {
  it('matches what the renderer will put on the heading', () => {
    expect(headingId('Bound the queue, always')).toBe('bound-the-queue-always');
  });

  it('folds accents rather than dropping the letters', () => {
    expect(headingId('Métricas')).toBe('metricas');
  });
});

describe('entryNumber', () => {
  it('numbers a newest-first list so the oldest entry is 001', () => {
    const total = 14;
    expect(entryNumber(0, total)).toBe('014');
    expect(entryNumber(13, total)).toBe('001');
  });

  it('pads past three digits rather than truncating', () => {
    expect(entryNumber(0, 1200)).toBe('1200');
  });

  it('never renders a zero or a negative for a single-item or empty list', () => {
    expect(entryNumber(0, 1)).toBe('001');
    // Defensive: an index past the end should still read as a valid entry.
    expect(entryNumber(5, 0)).toBe('001');
  });
});
