'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicSettings } from '@/src/db/types';

export function McpSettings({
  initial,
  endpoint,
}: {
  initial: PublicSettings;
  endpoint: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shown once after minting; the token is not readable again afterwards. */
  const [freshToken, setFreshToken] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? 'Could not save settings.');
      setBusy(false);
      return;
    }
    setSettings(data.settings);
    if (data.mcpToken) setFreshToken(data.mcpToken);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded border border-[var(--color-rule)] p-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold">MCP endpoint</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
            Lets an external AI portal connect to this blog and draft posts. While it is off,
            every request to the endpoint is refused — no token works, so you can disconnect
            an integration instantly without rotating credentials.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.mcpEnabled}
          aria-label="Enable MCP endpoint"
          disabled={busy}
          onClick={() => patch({ mcpEnabled: !settings.mcpEnabled })}
          className={`relative h-7 w-12 flex-none rounded-full transition-colors disabled:opacity-50 ${
            settings.mcpEnabled ? 'bg-[var(--color-accent)]' : 'bg-neutral-300 dark:bg-neutral-700'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
              settings.mcpEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {settings.mcpEnabled ? (
        <div className="mt-6 space-y-5 border-t border-[var(--color-rule)] pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Endpoint URL
            </p>
            <code className="mt-1 block overflow-x-auto rounded bg-[var(--color-raised)] px-3 py-2 text-sm">
              {endpoint}
            </code>
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Bearer token
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ rotateMcpToken: true })}
                className="text-sm text-[var(--color-accent)] hover:underline disabled:opacity-50"
              >
                {settings.hasMcpToken ? 'Rotate token' : 'Generate token'}
              </button>
            </div>

            {freshToken ? (
              <div className="mt-2">
                <code className="block overflow-x-auto rounded bg-[var(--color-raised)] px-3 py-2 text-sm">
                  {freshToken}
                </code>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Copy this now — it is not shown again. Rotating invalidates the previous token.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                {settings.hasMcpToken
                  ? 'A token is set. Rotate it if it may have leaked.'
                  : 'No token yet.'}
              </p>
            )}
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.mcpAllowPublish}
              disabled={busy}
              onChange={(e) => patch({ mcpAllowPublish: e.target.checked })}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">Allow connected clients to publish and delete</span>
              <span className="block text-[var(--color-muted)]">
                Off by default. While off, a connected AI can only create and edit drafts —
                putting a post on the public site stays a human decision.
              </span>
            </span>
          </label>

          <details className="text-sm">
            <summary className="cursor-pointer text-[var(--color-muted)]">
              How to connect an external client
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-raised)] p-3 text-xs">
{`{
  "mcpServers": {
    "blog": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}`}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
