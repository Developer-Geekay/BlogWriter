'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/components/Markdown';
import {
  POST_KINDS,
  POST_MATURITIES,
  kindLabel,
  maturityLabel,
  type Post,
  type PostKind,
  type PostMaturity,
  type PostStatus,
} from '@/src/db/types';

interface Props {
  /** Absent when composing a new post. */
  post?: Post;
}

/** Idle time before an edit to a saved post is written back. */
const AUTOSAVE_IDLE_MS = 2000;

export function PostEditor({ post }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [tags, setTags] = useState((post?.tags ?? []).join(', '));
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [kind, setKind] = useState<PostKind>(post?.kind ?? 'notes');
  const [maturity, setMaturity] = useState<PostMaturity>(post?.maturity ?? 'seed');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Last successful autosave, or an explicit failure. Never a guess. */
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [autosaveFailed, setAutosaveFailed] = useState(false);

  // A draft has no public URL — /entry/[slug] 404s until it is published — so
  // this is the only way to see how a post actually reads before committing to
  // it. Rendered through the same Markdown component as the live page, so what
  // you check here is what ships.
  //
  // Open by default, as the design has it: the preview is the point of the
  // two-column layout, and an editor that starts with half the screen blank
  // invites you to never turn it on.
  const [preview, setPreview] = useState(true);

  const words = body.split(/\s+/).filter(Boolean).length;

  const payload = useCallback(
    (status?: PostStatus) => ({
      title,
      excerpt,
      body,
      kind,
      maturity,
      coverImage: coverImage.trim() || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ...(slug.trim() ? { slug: slug.trim() } : {}),
      ...(status ? { status } : {}),
    }),
    [title, excerpt, body, kind, maturity, coverImage, tags, slug],
  );

  /*
   * Autosave.
   *
   * Only for a post that already exists: a new one has no id, so every debounce
   * tick would POST and create another row. It also stays out of the way of an
   * explicit save — `busy` gates it — so the two cannot race for the same
   * document. A failure is shown rather than swallowed; an autosave that has
   * been quietly failing for ten minutes is worse than not having one.
   */
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = true;
  }, [title, excerpt, body, kind, maturity, coverImage, tags, slug]);

  useEffect(() => {
    if (!post || busy) return;

    const timer = setTimeout(async () => {
      if (!dirty.current || !title.trim()) return;
      dirty.current = false;
      try {
        const response = await fetch(`/api/posts/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
        });
        if (!response.ok) throw new Error('save failed');
        setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setAutosaveFailed(false);
      } catch {
        setAutosaveFailed(true);
      }
    }, AUTOSAVE_IDLE_MS);

    return () => clearTimeout(timer);
  }, [post, busy, title, payload]);

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

    dirty.current = false;
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
      router.push('/admin/posts');
      router.refresh();
      return;
    }
    setError('Could not delete.');
    setBusy(false);
  }

  return (
    <div>
      <section className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--rule)] pb-3.5 pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--accent-text)]">
            {post?.status ?? 'New'}
            {autosaveFailed
              ? ' · autosave failed'
              : savedAt
                ? ` · autosaved ${savedAt}`
                : post
                  ? ''
                  : ' · not saved yet'}
          </span>
          <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            {words} words · {Math.max(1, Math.round(words / 200))} min
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            aria-pressed={preview}
            className="btn btn-secondary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
          >
            {preview ? 'Hide preview' : 'Show preview'}
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={busy}
            className="btn btn-secondary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
          >
            {busy ? 'Saving…' : 'Save draft'}
          </button>
          {post?.status === 'published' ? (
            <button
              type="button"
              onClick={() => save('draft')}
              disabled={busy}
              className="btn btn-secondary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save('published')}
              disabled={busy}
              className="btn btn-primary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
            >
              Publish
            </button>
          )}
        </div>
      </section>

      {error ? (
        <p role="alert" className="mt-3.5 border-2 border-[var(--accent)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {/*
        Two equal columns: the editor, and the preview live beside it.

        The design shows the rendered entry next to what you are typing, not
        behind a tab that swaps one for the other — you write against the
        result. `auto-fit` with a 320px floor collapses them to one column on a
        narrow screen, where side-by-side would give each half too little to be
        worth reading.

        `min-w-0` on both. A grid item defaults to `min-width: auto`, which
        sizes the track to the item's min-content — and a preview body contains
        `pre` blocks whose min-content is their longest line, because
        `white-space: pre` never wraps. The track grew to fit them, and since
        the editor fields are `w-full` the title and excerpt were dragged
        off-screen with it. The `overflow-x: auto` on `pre` only starts
        scrolling once its ancestor has a definite width, which this restores.
      */}
      <div className="grid border-b-2 border-[var(--rule)] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="min-w-0 border-r-2 border-[var(--soft)] py-4 pr-4">
          <input
            aria-label="Title"
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-3.5 w-full border-0 border-b-2 border-[var(--rule)] bg-transparent pb-2.5 text-2xl font-extrabold tracking-[-0.02em] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />

          <textarea
            aria-label="Excerpt"
            placeholder="A one-line summary shown in the feed…"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            className="mb-3.5 w-full resize-y border-0 bg-transparent text-[17px] text-[var(--muted)] outline-none"
          />

          <ChipRow
            legend="Kind"
            options={POST_KINDS}
            value={kind}
            label={kindLabel}
            onPick={setKind}
          />
          <ChipRow
            legend="Maturity"
            options={POST_MATURITIES}
            value={maturity}
            label={maturityLabel}
            onPick={setMaturity}
          />

          <textarea
            aria-label="Body"
            placeholder="Write in Markdown…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            spellCheck={false}
            className="input min-h-[340px] w-full resize-y p-3 font-[family-name:var(--mono)] text-[13px] leading-[1.65]"
          />

          <p className="mt-2.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            Markdown · ## H2 **bold** `code` ``` fence ``` - list &gt; takeaway
          </p>

          {/*
            Tags, cover and slug fold away. The design's editor has none of
            them — it is a demo — but this one has to set them, and leaving four
            more fields open above the body would push the writing surface below
            the fold on a laptop. Closed by default, open the moment there is
            something in one of them.
          */}
          <details open={Boolean(tags || coverImage || slug)} className="mt-4">
            <summary className="cursor-pointer font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              Entry details
            </summary>

            <div className="mt-3 space-y-3">
              <Field label="Tags">
                <input
                  placeholder="comma, separated"
                  aria-label="Tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Cover image URL">
                <input
                  placeholder="https://…"
                  aria-label="Cover image URL"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Slug">
                <input
                  placeholder="auto from title"
                  aria-label="Slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </details>

          {post && post.unsupportedClaims.length > 0 ? (
            <div className="mt-4 border-2 border-[var(--accent)] p-4 text-sm">
              <p className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--accent-text)]">
                Unverified claims
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {post.unsupportedClaims.map((claim) => (
                  <li key={claim}>{claim}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {post ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {post.status === 'published' ? (
                <Link
                  href={`/entry/${post.slug}`}
                  target="_blank"
                  className="btn btn-secondary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline"
                >
                  View live ↗
                </Link>
              ) : null}
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="btn btn-ghost font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
              >
                Delete entry
              </button>
            </div>
          ) : null}
        </div>

        {preview ? (
          <section aria-label="Live preview" className="min-w-0 py-4 pl-4">
            <p className="mb-3 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Live preview
            </p>
            {coverImage.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImage.trim()} alt="" className="mb-5 w-full object-cover grayscale" />
            ) : null}
            <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">
              {title || 'Untitled'}
            </h2>
            {body.trim() ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-[var(--muted)]">Nothing to preview yet.</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="mb-1.5 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function ChipRow<T extends string>({
  legend,
  options,
  value,
  label,
  onPick,
}: {
  legend: string;
  options: readonly T[];
  value: T;
  label: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <fieldset className="mb-3.5 flex flex-wrap items-center gap-2">
      <legend className="sr-only">{legend}</legend>
      <span className="mr-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        {legend}
      </span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onPick(option)}
          className={`tag ${option === value ? 'tag-accent' : 'tag-neutral'} font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]`}
        >
          {label(option)}
        </button>
      ))}
    </fieldset>
  );
}
