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
    <section className="border-b-2 border-[var(--soft)] px-4 py-5">
      <p className="mb-3.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        MCP endpoint
      </p>

      <p className="mb-3.5 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
        Lets an external AI portal connect to this blog and draft posts. While it is off, every
        request to the endpoint is refused — no token works, so you can disconnect an integration
        instantly without rotating credentials.
      </p>

      {/* A switch as a row with an ON/OFF tag, not a sliding pill. A pill is a
          rounded control in a system whose radius is zero everywhere; this is
          the form the design uses for the same job. */}
      <Toggle
        label="Endpoint enabled"
        on={settings.mcpEnabled}
        busy={busy}
        onClick={() => patch({ mcpEnabled: !settings.mcpEnabled })}
      />

      {settings.mcpEnabled ? (
        <Toggle
          label="Allow connected clients to publish and delete"
          hint="Off by default. While off, a connected AI can only create and edit drafts — putting a post on the public site stays a human decision."
          on={settings.mcpAllowPublish}
          busy={busy}
          onClick={() => patch({ mcpAllowPublish: !settings.mcpAllowPublish })}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-3.5 border-2 border-[var(--accent)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {settings.mcpEnabled ? (
        <div className="mt-5 space-y-4 border-t-2 border-[var(--soft)] pt-4">
          <div>
            <p className="mb-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              Endpoint URL
            </p>
            <code className="block overflow-x-auto border-2 border-[var(--soft)] bg-[var(--panel)] px-3 py-2 font-[family-name:var(--mono)] text-[13px]">
              {endpoint}
            </code>
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                Bearer token
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ rotateMcpToken: true })}
                className="btn btn-ghost font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]"
              >
                {settings.hasMcpToken ? 'Rotate token' : 'Generate token'}
              </button>
            </div>

            {freshToken ? (
              <div className="mt-2">
                <code className="block overflow-x-auto border-2 border-[var(--accent)] bg-[var(--panel)] px-3 py-2 font-[family-name:var(--mono)] text-[13px]">
                  {freshToken}
                </code>
                <p className="mt-1.5 font-[family-name:var(--mono)] text-[10px] uppercase leading-relaxed tracking-[0.08em] text-[var(--accent-text)]">
                  Copy this now — it is not shown again. Rotating invalidates the previous token.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                {settings.hasMcpToken
                  ? 'A token is set. Rotate it if it may have leaked.'
                  : 'No token yet.'}
              </p>
            )}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
              How to connect an external client
            </summary>
            <pre className="mt-2 overflow-x-auto border-2 border-[var(--soft)] bg-[var(--panel)] p-3 font-[family-name:var(--mono)] text-xs">
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

function Toggle({
  label,
  hint,
  on,
  busy,
  onClick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border-b border-[var(--soft)] py-3 text-left text-[var(--ink)] disabled:opacity-45"
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
      </span>
      <span
        className={`tag ${on ? 'tag-accent' : 'tag-neutral'} flex-none font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em]`}
      >
        {on ? 'On' : 'Off'}
      </span>
    </button>
  );
}
