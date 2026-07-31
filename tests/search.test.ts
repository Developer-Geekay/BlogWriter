import { describe, expect, it } from 'vitest';
import { searchPattern } from '../src/db/posts.js';

/**
 * This is the pattern the MongoDB query is built from, so it is worth testing
 * directly — the in-memory store used elsewhere matches with `includes()` and
 * would not surface an escaping bug here.
 */
describe('searchPattern', () => {
  it('matches case-insensitively', () => {
    expect(searchPattern('Retrieval').test('better retrieval quality')).toBe(true);
  });

  it('matches inside a word, so partial tags are findable', () => {
    expect(searchPattern('context').test('context-engineering')).toBe(true);
    expect(searchPattern('engineering').test('context-engineering')).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(searchPattern('  rag  ').test('a post about rag')).toBe(true);
  });

  // An unescaped metacharacter would throw and take the search page down.
  it('treats regex metacharacters as literal text', () => {
    for (const term of ['what(s)', 'a+b', 'cost?', '[draft]', 'a|b', 'v1.0', '\\', '^start', 'end$']) {
      expect(() => searchPattern(term)).not.toThrow();
      expect(searchPattern(term).test(`prefix ${term} suffix`)).toBe(true);
    }
  });

  it('does not let a wildcard match everything', () => {
    // A naive implementation would turn ".*" into "match anything".
    expect(searchPattern('.*').test('an unrelated post')).toBe(false);
    expect(searchPattern('.*').test('literally .* here')).toBe(true);
  });
});
