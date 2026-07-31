'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Post, PostStatus } from '@/src/db/types';

interface Props {
  /** Absent when composing a new post. */
  post?: Post;
}

export function PostEditor({ post }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [tags, setTags] = useState((post?.tags ?? []).join(', '));
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const words = body.split(/\s+/).filter(Boolean).length;

  function payload(status?: PostStatus) {
    return {
      title,
      excerpt,
      body,
      coverImage: coverImage.trim() || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ...(slug.trim() ? { slug: slug.trim() } : {}),
      ...(status ? { status } : {}),
    };
  }

  async function save(status?: PostStatus) {
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    setBusy(true);
    setError(null);

    const response = post
      ? await fetch(`/api/posts/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload(status)),
        })
      : await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload(status ?? 'draft')),
        });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? 'Could not save.');
      setBusy(false);
      return;
    }

    router.push(`/admin/posts/${data.post.id}/edit`);
    router.refresh();
    setBusy(false);
  }

  async function remove() {
    if (!post) return;
    if (!confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setBusy(true);
    const response = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    if (response.ok) {
      router.push('/admin');
      router.refresh();
      return;
    }
    setError('Could not delete.');
    setBusy(false);
  }

  const field =
    'w-full rounded border border-[var(--color-rule)] bg-[var(--color-raised)] px-3 py-2 outline-none focus:border-[var(--color-accent)]';

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <input
          aria-label="Title"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border-none bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-[var(--color-muted)]"
        />

        <textarea
          aria-label="Excerpt"
          placeholder="A one-line summary shown in the feed…"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          className="mt-4 w-full resize-y border-none bg-transparent text-lg text-[var(--color-muted)] outline-none"
        />

        <textarea
          aria-label="Body"
          placeholder="Write in Markdown…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={26}
          className="article-body mt-6 w-full resize-y rounded border border-[var(--color-rule)] bg-transparent p-4 outline-none"
        />

        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {words} words · about {Math.max(1, Math.round(words / 200))} min read · Markdown
        </p>
      </div>

      <aside className="space-y-5">
        {error ? (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="rounded border border-[var(--color-rule)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Status
          </p>
          <p className="mt-1 font-medium capitalize">{post?.status ?? 'new'}</p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => save()}
              disabled={busy}
              className="w-full rounded-full border border-[var(--color-rule)] px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save draft'}
            </button>

            {post?.status === 'published' ? (
              <button
                type="button"
                onClick={() => save('draft')}
                disabled={busy}
                className="w-full rounded-full border border-[var(--color-rule)] px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => save('published')}
                disabled={busy}
                className="w-full rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Publish
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded border border-[var(--color-rule)] p-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Tags
            </label>
            <input
              placeholder="comma, separated"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={`mt-1 ${field}`}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Cover image URL
            </label>
            <input
              placeholder="https://…"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              className={`mt-1 ${field}`}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Slug
            </label>
            <input
              placeholder="auto from title"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`mt-1 ${field}`}
            />
          </div>
        </div>

        {post && post.unsupportedClaims.length > 0 ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Unverified claims
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-900 dark:text-amber-200">
              {post.unsupportedClaims.map((claim) => (
                <li key={claim}>{claim}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {post ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Delete post
          </button>
        ) : null}
      </aside>
    </div>
  );
}
