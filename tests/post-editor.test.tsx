// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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
    kind: 'deep-dive',
    maturity: 'seed',
    sources: [],
    unsupportedClaims: [],
    ...overrides,
  } as Parameters<MemoryPostStore['create']>[0]);
}

afterEach(cleanup);

/** The preview control is one toggle, labelled by what clicking it will do. */
const showPreview = () => screen.getByRole('button', { name: 'Show preview' });
const hidePreview = () => screen.getByRole('button', { name: 'Hide preview' });

describe('PostEditor preview', () => {
  it('starts with the source editable and the preview already open', async () => {
    render(<PostEditor post={await fixture()} />);

    expect(screen.getByLabelText('Body')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Live preview' })).toBeDefined();
    expect(hidePreview().getAttribute('aria-pressed')).toBe('true');
  });

  it('renders the Markdown beside the source, not instead of it', async () => {
    render(<PostEditor post={await fixture()} />);

    // Side by side: you write against the rendered result, so the textarea
    // stays editable while the preview is up.
    expect(screen.getByLabelText('Body')).toBeDefined();

    const preview = within(screen.getByRole('region', { name: 'Live preview' }));
    expect(preview.getByRole('heading', { name: 'A heading' })).toBeDefined();
    expect(preview.getByRole('link', { name: 'link' }).getAttribute('href')).toBe(
      'https://example.com',
    );
  });

  it('tracks the source as it is typed', async () => {
    render(<PostEditor post={await fixture()} />);

    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'rewritten' } });

    const preview = within(screen.getByRole('region', { name: 'Live preview' }));
    expect(preview.getByText('rewritten')).toBeDefined();
  });

  it('keeps edits when the preview is closed again', async () => {
    render(<PostEditor post={await fixture()} />);

    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'rewritten' } });

    fireEvent.click(hidePreview());
    expect(screen.queryByRole('region', { name: 'Live preview' })).toBeNull();
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('rewritten');
  });

  it('says so rather than rendering an empty frame', () => {
    render(<PostEditor />);

    expect(screen.getByText('Nothing to preview yet.')).toBeDefined();
  });

  it('reopens after being closed', async () => {
    render(<PostEditor post={await fixture()} />);

    fireEvent.click(hidePreview());
    expect(screen.queryByRole('region', { name: 'Live preview' })).toBeNull();

    fireEvent.click(showPreview());
    expect(screen.getByRole('region', { name: 'Live preview' })).toBeDefined();
  });

  it('files the entry under the kind and maturity picked in the chip rows', async () => {
    render(<PostEditor post={await fixture()} />);

    // The stored values start pressed…
    expect(screen.getByRole('button', { name: 'DEEP DIVE' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'SEED' }).getAttribute('aria-pressed')).toBe('true');

    // …and picking another moves the pressed state with it.
    fireEvent.click(screen.getByRole('button', { name: 'EVERGREEN' }));
    expect(screen.getByRole('button', { name: 'EVERGREEN' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'SEED' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('offers the live link only once a post is published', async () => {
    const draft = await fixture();
    const { rerender } = render(<PostEditor post={draft} />);
    // A draft's public URL 404s, so linking to it would be a dead end.
    expect(screen.queryByRole('link', { name: /View live/ })).toBeNull();

    rerender(<PostEditor post={{ ...draft, status: 'published' }} />);
    expect(
      screen.getByRole('link', { name: /View live/ }).getAttribute('href'),
    ).toBe(`/entry/${draft.slug}`);
  });
});
