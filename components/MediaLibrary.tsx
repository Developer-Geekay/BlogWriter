'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaObject } from '@/src/media/store';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The media library.
 *
 * Loads its own list rather than being handed one by the server page: object
 * storage is a second backend that can be down while the database is fine, and
 * fetching here means that failure lands in this panel instead of taking the
 * whole route to an error screen.
 */
export function MediaLibrary() {
  const [objects, setObjects] = useState<MediaObject[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/media');
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not list media.');
        setObjects([]);
        return;
      }
      setConfigured(data.configured);
      setObjects(data.objects);
    } catch {
      setError('Could not reach the server.');
      setObjects([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/media', { method: 'POST', body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        // Stop on the first failure rather than pressing on: the usual cause is
        // a limit or a misconfiguration, which the next file will hit too.
        setError(data.error ?? `Could not upload ${file.name}.`);
        break;
      }
    }

    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    void load();
  }

  async function remove(key: string) {
    if (!confirm(`Delete ${key}? Any entry using it will lose its image.`)) return;
    setBusy(true);
    const response = await fetch(`/api/media/${key}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? 'Could not delete.');
    }
    setBusy(false);
    void load();
  }

  async function copy(key: string) {
    const url = `${location.origin}/api/media/${key}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      // Clipboard can be refused; the URL is still visible under the tile.
    }
  }

  return (
    <div>
      <section className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[var(--rule)] pb-4 pt-6">
        <h1 className="text-[clamp(26px,6vw,38px)] font-extrabold tracking-[-0.03em]">Media</h1>
        <div className="flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <button
            type="button"
            disabled={busy || !configured}
            onClick={() => fileInput.current?.click()}
            className="btn btn-primary font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
          >
            {busy ? 'Working…' : '↑ Upload'}
          </button>
        </div>
      </section>

      {!configured ? (
        <p className="my-4 border-2 border-[var(--accent)] px-4 py-3 text-sm leading-relaxed">
          Object storage is not configured. Set <code>S3_BUCKET</code>,{' '}
          <code>S3_ACCESS_KEY_ID</code> and <code>S3_SECRET_ACCESS_KEY</code> in{' '}
          <code>.env</code> — see <code>.env.example</code>.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="my-4 border-2 border-[var(--accent)] px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {objects === null ? (
        <p className="py-16 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Loading…
        </p>
      ) : objects.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">
          {configured
            ? 'Nothing uploaded yet. Images land here and can be pasted into an entry’s cover field.'
            : 'No media to show.'}
        </p>
      ) : (
        <section className="grid border-l-2 border-[var(--soft)] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {objects.map((object) => (
            <div key={object.key} className="border-b-2 border-r-2 border-[var(--soft)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${object.key}`}
                alt=""
                loading="lazy"
                className="mb-2 aspect-square w-full border-2 border-[var(--soft)] bg-[var(--panel)] object-cover"
              />
              <div
                title={object.key}
                className="truncate font-[family-name:var(--mono)] text-[10px] text-[var(--ink)]"
              >
                {object.key.split('/').pop()}
              </div>
              <div className="mb-2 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                {humanSize(object.size)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => copy(object.key)}
                  className="border border-[var(--soft)] px-1.5 py-0.5 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.08em] hover:bg-[var(--panel)]"
                >
                  {copied === object.key ? 'Copied' : 'Copy URL'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(object.key)}
                  className="border border-[var(--soft)] px-1.5 py-0.5 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--accent-text)] hover:bg-[var(--panel)] disabled:opacity-45"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
