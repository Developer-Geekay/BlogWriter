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
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm px-5">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Admin access to the portal.</p>

      <label className="mt-8 block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 w-full rounded border border-[var(--color-rule)] px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <label className="mt-4 block text-sm font-medium" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 w-full rounded border border-[var(--color-rule)] px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />

      {error ? (
        <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-full bg-[var(--color-accent)] px-4 py-2 font-medium text-white disabled:opacity-50"
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
