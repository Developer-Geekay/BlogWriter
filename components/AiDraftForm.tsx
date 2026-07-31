'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Kicks off the research-and-write pipeline and opens the result in the editor. */
export function AiDraftForm() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [research, setResearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);

    const response = await fetch('/api/posts/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, research }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? 'Drafting failed.');
      setBusy(false);
      return;
    }
    router.push(`/admin/posts/${data.post.id}/edit`);
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-[var(--color-rule)] p-4"
    >
      <label htmlFor="topic" className="text-sm font-medium">
        Draft with AI
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="topic"
          placeholder="What should it be about?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-[var(--color-rule)] bg-[var(--color-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !topic.trim()}
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Writing…' : 'Draft'}
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <input
          type="checkbox"
          checked={research}
          disabled={busy}
          onChange={(e) => setResearch(e.target.checked)}
        />
        Research the web first (slower, better sourced)
      </label>

      {busy ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Researching, writing, editing, and fact-checking. This takes a few minutes.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
