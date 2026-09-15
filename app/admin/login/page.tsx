'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      // Refresh so server components pick up the new session cookie.
      router.replace(params.get('next') ?? '/admin');
      router.refresh();
      return;
    }

    const body = await response.json().catch(() => ({}));
    setError(body.error ?? 'Could not sign in.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="field mx-auto mt-24 max-w-sm px-4">
      <p className="mb-3 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
        Portal
      </p>
      <h1 className="mb-2 text-[clamp(28px,6vw,42px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
        Sign in
      </h1>
      <p className="mb-7 text-sm text-[var(--muted)]">Admin access to the portal.</p>

      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input mb-4"
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input"
      />

      {error ? (
        <p role="alert" className="mt-4 border-2 border-[var(--accent)] px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary mt-6 w-full justify-center font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em]"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
