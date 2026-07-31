'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicSettings } from '@/src/db/types';

export function SiteSettings({ initial }: { initial: PublicSettings }) {
  const router = useRouter();
  const [siteTitle, setSiteTitle] = useState(initial.siteTitle);
  const [siteDescription, setSiteDescription] = useState(initial.siteDescription);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteTitle, siteDescription }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'Could not save.');
      setBusy(false);
      return;
    }
    setSaved(true);
    setBusy(false);
    router.refresh();
  }

  const field =
    'mt-1 w-full rounded border border-[var(--color-rule)] px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900';

  return (
    <section className="rounded border border-[var(--color-rule)] p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">Site</h2>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Title
      </label>
      <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className={field} />

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Description
      </label>
      <textarea
        value={siteDescription}
        onChange={(e) => setSiteDescription(e.target.value)}
        rows={2}
        className={field}
      />

      {error ? (
        <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-4 rounded-full border border-[var(--color-rule)] px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
    </section>
  );
}
