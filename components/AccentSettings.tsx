'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACCENTS } from '@/src/theme/accents';
import type { PublicSettings } from '@/src/db/types';

/**
 * Accent picker.
 *
 * Saves immediately on click rather than behind a Save button: the whole point
 * of the control is seeing the colour applied, and `router.refresh()` re-runs
 * the root layout, which is what emits the accent stylesheet. A separate save
 * step would mean choosing a colour and then not seeing it.
 */
export function AccentSettings({ initial }: { initial: PublicSettings }) {
  const router = useRouter();
  const [accent, setAccent] = useState(initial.siteAccent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: string) {
    const previous = accent;
    setAccent(id);
    setBusy(true);
    setError(null);

    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteAccent: id }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      // Put the swatch back where it was — leaving it on the failed choice
      // would claim a colour that is not saved.
      setAccent(previous);
      setError(data.error ?? 'Could not save the accent.');
      setBusy(false);
      return;
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <section className="border-b-2 border-r-2 border-[var(--soft)] px-4 py-5">
      <p className="mb-3.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        Accent
      </p>

      <p className="mb-4 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
        One colour carries the whole interface — fills, rules, the active filter and every mono
        label. Each option ships a hand-tuned pair so it stays legible in both light and dark.
      </p>

      <div className="flex flex-wrap gap-2">
        {ACCENTS.map((option) => {
          const active = option.id === accent;
          return (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => pick(option.id)}
              className={`flex items-center gap-2 border-2 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] disabled:opacity-45 ${
                active
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-[var(--soft)] text-[var(--muted)] hover:border-[var(--ink)]'
              }`}
            >
              {/*
                Two chips, not one: the light and dark variants are different
                colours, and showing only the one for the current theme hides
                half of what is being chosen.
              */}
              <span aria-hidden className="flex">
                <span className="h-4 w-4" style={{ background: option.light }} />
                <span className="h-4 w-4" style={{ background: option.dark }} />
              </span>
              {option.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-3 border-2 border-[var(--accent)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
