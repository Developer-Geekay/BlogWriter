'use client';

import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/admin/login');
        router.refresh();
      }}
      className="hover:text-[var(--color-accent)]"
    >
      Sign out
    </button>
  );
}
