'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicSettings } from '@/src/db/types';

export function SiteSettings({ initial }: { initial: PublicSettings }) {
  const router = useRouter();
  const [siteTitle, setSiteTitle] = useState(initial.siteTitle);
  const [siteDescription, setSiteDescription] = useState(initial.siteDescription);
  const [siteAuthor, setSiteAuthor] = useState(initial.siteAuthor);
  const [siteRole, setSiteRole] = useState(initial.siteRole);
  const [siteBio, setSiteBio] = useState(initial.siteBio);
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
      body: JSON.stringify({ siteTitle, siteDescription, siteAuthor, siteRole, siteBio }),
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

  return (
    <section className="field border-b-2 border-r-2 border-[var(--soft)] px-4 py-5">
      <p className="mb-3.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        Identity
      </p>

      <Label>Site title</Label>
      <input
        value={siteTitle}
        onChange={(e) => setSiteTitle(e.target.value)}
        className="input mb-3.5 text-[15px]"
      />

      <Label>Display name</Label>
      <input
        value={siteAuthor}
        onChange={(e) => setSiteAuthor(e.target.value)}
        placeholder="Shown beside the wordmark. Leave empty to hide."
        className="input mb-3.5 text-[15px]"
      />

      <Label>Role</Label>
      <input
        value={siteRole}
        onChange={(e) => setSiteRole(e.target.value)}
        placeholder="Technical Lead, Platform Engineering"
        className="input mb-3.5 text-[15px]"
      />

      <Label>Description</Label>
      <textarea
        value={siteDescription}
        onChange={(e) => setSiteDescription(e.target.value)}
        rows={2}
        className="input mb-3.5 text-[15px]"
      />

      <Label>Bio — the about page</Label>
      <textarea
        value={siteBio}
        onChange={(e) => setSiteBio(e.target.value)}
        rows={4}
        className="input text-[15px]"
      />

      {error ? (
        <p role="alert" className="mt-3 border-2 border-[var(--accent)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {/* No sign-out here. It sits in the portal header beside "exit admin",
          which is where you look for it; two of the same control in two places
          is how one of them goes stale. */}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="btn btn-primary mt-4 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
      >
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
      {children}
    </label>
  );
}
