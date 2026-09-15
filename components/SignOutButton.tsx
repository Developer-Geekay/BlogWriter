'use client';

import { useRouter } from 'next/navigation';

/**
 * Sign out, as an icon in the portal header.
 *
 * Distinct from "exit admin" beside it, which only crosses back to the reader
 * side and leaves the session alone. Leaving the portal and ending the session
 * are different intentions, and one of them is a nuisance to undo — so they are
 * two controls, not one, and this is the one that looks like a door.
 */
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
      aria-label="Sign out"
      title="Sign out"
      className="flex h-9 w-9 flex-none items-center justify-center border-2 border-[var(--soft)] text-[var(--ink)] transition-colors hover:bg-[var(--panel)]"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  );
}
