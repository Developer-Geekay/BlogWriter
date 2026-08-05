// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { PostEditor } = await import('../components/PostEditor.js');
const { MemoryPostStore } = await import('./helpers/memory-store.js');

/** A stored post, built by the store so the shape cannot drift from the real one. */
async function fixture(overrides: Record<string, unknown> = {}) {
  const posts = new MemoryPostStore();
  return posts.create({
    title: 'Inside the core architecture',
    body: '## A heading\n\nSome **bold** prose and a [link](https://example.com).',
    excerpt: 'A deep dive.',
    tags: ['architecture'],
    coverImage: null,
    slug: undefined,
    status: 'draft',
    sources: [],
    unsupportedClaims: [],
    ...overrides,
  } as Parameters<MemoryPostStore['create']>[0]);
}

afterEach(cleanup);

describe('PostEditor preview', () => {
  it('starts in write mode with the Markdown source editable', async () => {
    render(<PostEditor post={await fixture()} />);

    expect(screen.getByLabelText('Body')).toBeDefined();
    expect(screen.getByRole('button', { name: 'write' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders the Markdown when switched to preview', async () => {
    render(<PostEditor post={await fixture()} />);

    fireEvent.click(screen.getByRole('button', { name: 'preview' }));

    // The source is replaced by the rendered article, not shown alongside it.
    expect(screen.queryByLabelText('Body')).toBeNull();
    expect(screen.getByRole('heading', { name: 'A heading' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'link' }).getAttribute('href')).toBe(
      'https://example.com',
    );
  });

  it('keeps edits when toggling back and forth', async () => {
    render(<PostEditor post={await fixture()} />);

    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'rewritten' } });

    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    expect(screen.getByText('rewritten')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'write' }));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('rewritten');
  });

  it('says so rather than rendering an empty frame', () => {
    render(<PostEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    expect(screen.getByText('Nothing to preview yet.')).toBeDefined();
  });

  it('offers the live link only once a post is published', async () => {
    const draft = await fixture();
    const { rerender } = render(<PostEditor post={draft} />);
    // A draft's public URL 404s, so linking to it would be a dead end.
    expect(screen.queryByRole('link', { name: /View live/ })).toBeNull();

    rerender(<PostEditor post={{ ...draft, status: 'published' }} />);
    expect(
      screen.getByRole('link', { name: /View live/ }).getAttribute('href'),
    ).toBe(`/blog/${draft.slug}`);
  });
});
