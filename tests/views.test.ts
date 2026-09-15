import { describe, expect, it } from 'vitest';
import { classifySource, dayKey, recentDays } from '../src/db/views.js';

describe('classifySource', () => {
  it('treats a missing or unparseable referrer as direct', () => {
    expect(classifySource(undefined)).toBe('direct');
    expect(classifySource('')).toBe('direct');
    expect(classifySource('not a url')).toBe('direct');
  });

  it('recognises search engines', () => {
    expect(classifySource('https://www.google.com/search?q=x')).toBe('search');
    expect(classifySource('https://duckduckgo.com/')).toBe('search');
    expect(classifySource('https://www.bing.com/')).toBe('search');
  });

  it('counts same-origin navigation as direct, not as a referral', () => {
    // Otherwise the index page becomes the site's biggest traffic source.
    expect(classifySource('https://blog.example/', 'blog.example')).toBe('direct');
  });

  it('counts anything else as a referral', () => {
    expect(classifySource('https://news.ycombinator.com/item?id=1')).toBe('referral');
    expect(classifySource('https://blog.example/', 'other.example')).toBe('referral');
  });

  it('does not match a search engine name appearing elsewhere in the host', () => {
    // "notgoogle.com" and "google.evil.com" are not Google.
    expect(classifySource('https://notgoogle.com/')).toBe('referral');
  });
});

describe('day keys', () => {
  it('keys by UTC date, so the series does not shift with the server timezone', () => {
    expect(dayKey(new Date('2026-09-13T23:30:00Z'))).toBe('2026-09-13');
    expect(dayKey(new Date('2026-09-14T00:30:00Z'))).toBe('2026-09-14');
  });

  it('returns the window oldest-first and includes today', () => {
    const days = recentDays(3, new Date('2026-09-13T12:00:00Z'));
    expect(days).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
  });

  it('spans a month boundary correctly', () => {
    const days = recentDays(3, new Date('2026-10-01T12:00:00Z'));
    expect(days).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});
