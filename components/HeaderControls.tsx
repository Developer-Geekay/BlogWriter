'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAdminLoginPath, isAdminPath } from '@/src/routes';
import { CommandPalette } from '@/components/CommandPalette';
import { SignOutButton } from '@/components/SignOutButton';
import { ThemeToggle } from '@/components/ThemeToggle';

const ADMIN_NAV = [
  { href: '/admin', label: 'DASHBOARD' },
  { href: '/admin/posts', label: 'ENTRIES' },
  { href: '/admin/posts/new', label: 'EDITOR' },
  { href: '/admin/media', label: 'MEDIA' },
  { href: '/admin/analytics', label: 'ANALYTICS' },
  { href: '/admin/settings', label: 'SETTINGS' },
] as const;

/**
 * The right-hand side of the site header, plus the nav row beneath it.
 *
 * One header serves both the public site and the portal. The design switches
 * between them with a mode flag; the real app separates them by route and by
 * auth, so the "ADMIN" / "EXIT ADMIN" control is a link gated on being signed
 * in, not a toggle. A reader is never shown a portal control, and there is no
 * sign-in link anywhere public — the portal is reached by typing /admin.
 *
 * Client-side because it keys off the path. `usePathname` resolves during the
 * server pass too, so the markup is stable across hydration.
 */
export function HeaderControls({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // Everything served under /admin, the login page included.
  const underAdmin = isAdminPath(pathname);
  const onLogin = isAdminLoginPath(pathname);
  // The login page is under /admin but is not the portal — see src/routes.ts.
  const inAdmin = underAdmin && !onLogin;

  return (
    <>
      <span className="ml-2 hidden shrink-0 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] sm:inline">
        {onLogin ? 'Sign in' : inAdmin ? 'Admin' : 'Knowledge Portal'}
      </span>

      <div className="min-w-0 flex-1" />

      <nav className="flex flex-none items-center gap-2">
        {/*
          ⌘K is a reader feature. It is a way into the writing for someone
          browsing the site; inside the portal the Entries list is already the
          index of everything, and a floating search over the same set is a
          second answer to a question that screen exists to answer.

          Gated on the whole /admin tree, not just the portal proper, so it is
          also absent from the sign-in page — searching published posts from a
          login screen serves nobody. Nothing binds the shortcut when the
          palette is not rendered, so ⌘K is simply inert here.
        */}
        {underAdmin ? null : <PaletteButton />}
        <ThemeToggle />

        {/*
          Shown signed in or not — it is the only way into the portal from the
          UI. Signed out it lands on /admin, which middleware sends to the login
          page, so the control is honest about where it goes. This is a
          deliberate change from the previous site, which had no entry point at
          all and expected you to know to type /admin; the design puts the door
          in the header.

          Hidden on the login page itself, where "Admin" would point at the page
          you are already on and "Exit admin" would claim you are in a portal
          you have not entered.
        */}
        {onLogin ? null : (
          <Link
            href={inAdmin ? '/' : '/admin'}
            className="flex h-9 flex-none items-center bg-[var(--ink)] px-2.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em] text-[var(--ground)] no-underline hover:opacity-90"
          >
            {inAdmin ? 'Exit admin' : 'Admin'}
          </Link>
        )}

        {/* Only in the portal. A reader is never shown a control for a session
            they are not thinking about, which is the same reason there is no
            sign-in link anywhere public. */}
        {inAdmin && signedIn ? <SignOutButton /> : null}
      </nav>

      {/*
        The sub-nav row is the portal's, and only the portal's. On the reader
        side the design carries LOG / TOPICS / ABOUT in the footer instead, so
        putting them here too would state the same navigation twice on every
        public page. Below the brand line and horizontally scrollable, so six
        admin links cannot push the controls off the right edge of a phone.
      */}
      {inAdmin ? (
        <div className="order-last w-full overflow-x-auto">
          <div className="flex gap-4 pb-1 pt-2">
            {ADMIN_NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap border-b-2 pb-1 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.12em] no-underline ${
                    active
                      ? 'border-[var(--accent)] text-[var(--ink)]'
                      : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {underAdmin ? null : <CommandPalette />}
    </>
  );
}

/**
 * Opens the palette by synthesising the shortcut the palette already listens
 * for, so there is one code path for opening it and no shared state to keep in
 * step between the two.
 */
function PaletteButton() {
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  return (
    <button
      type="button"
      title="Search"
      aria-label="Open the command palette"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }),
        )
      }
      className="flex h-9 flex-none items-center gap-2 border-2 border-[var(--soft)] bg-[var(--panel)] px-2.5 font-[family-name:var(--mono)] text-[11px] tracking-[0.08em] text-[var(--muted)] hover:text-[var(--ink)]"
    >
      {/* Rendered after mount: the modifier depends on the platform, which the
          server cannot know, and guessing would mismatch on hydration. */}
      <span suppressHydrationWarning>{mac ? '⌘K' : 'Ctrl K'}</span>
    </button>
  );
}
