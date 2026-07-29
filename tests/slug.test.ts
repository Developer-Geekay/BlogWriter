import { describe, expect, it } from 'vitest';
import {
  InvalidSlugError,
  SLUG_MAX_LENGTH,
  assertValidSlug,
  isValidSlug,
  slugify,
  uniqueSlug,
} from '../src/store/slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Why Retrieval Beats Context Size')).toBe('why-retrieval-beats-context-size');
  });

  it('folds accents to ASCII instead of dropping them', () => {
    expect(slugify('Métricas de Café')).toBe('metricas-de-cafe');
  });

  it('does not split words on apostrophes', () => {
    expect(slugify("What I Got Wrong About Node's Event Loop")).toBe(
      'what-i-got-wrong-about-nodes-event-loop',
    );
  });

  it('collapses punctuation runs and trims edges', () => {
    expect(slugify('  ...Hello, World!!!  ')).toBe('hello-world');
  });

  it('produces slugs the API regex accepts', () => {
    const titles = [
      'Rust vs. Go: A Comparison (2026)',
      '100% uptime — and other lies',
      'gRPC & HTTP/2',
    ];
    for (const t of titles) expect(isValidSlug(slugify(t))).toBe(true);
  });

  it('truncates over-long titles at a word boundary', () => {
    const slug = slugify(Array.from({ length: 40 }, () => 'verylongword').join(' '));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(isValidSlug(slug)).toBe(true);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('rejects titles with nothing slug-safe in them', () => {
    expect(() => slugify('!!! ???')).toThrow(InvalidSlugError);
  });
});

describe('assertValidSlug', () => {
  it('rejects a leading hyphen', () => {
    expect(() => assertValidSlug('-leading')).toThrow(InvalidSlugError);
  });

  it('rejects uppercase and underscores', () => {
    expect(() => assertValidSlug('Not_Valid')).toThrow(InvalidSlugError);
  });

  it('rejects the empty string', () => {
    expect(() => assertValidSlug('')).toThrow(InvalidSlugError);
  });

  it('rejects slugs one character over the API limit', () => {
    expect(() => assertValidSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toThrow(InvalidSlugError);
  });

  it('accepts a slug exactly at the limit', () => {
    expect(() => assertValidSlug('a'.repeat(SLUG_MAX_LENGTH))).not.toThrow();
  });
});

describe('uniqueSlug', () => {
  it('returns the slug untouched when free', () => {
    expect(uniqueSlug('post', ['other'])).toBe('post');
  });

  it('suffixes on collision', () => {
    expect(uniqueSlug('post', ['post'])).toBe('post-2');
    expect(uniqueSlug('post', ['post', 'post-2'])).toBe('post-3');
  });

  it('keeps suffixed slugs inside the length limit', () => {
    const long = 'a'.repeat(SLUG_MAX_LENGTH);
    const result = uniqueSlug(long, [long]);
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(isValidSlug(result)).toBe(true);
  });
});
