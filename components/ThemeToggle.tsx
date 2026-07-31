'use client';

import { useEffect, useState } from 'react';

export const THEME_KEY = 'blogwriter-theme';

/**
 * Applied before first paint by the inline script in the layout, and again here
 * whenever the choice changes. Kept in one place so the two cannot drift.
 */
function apply(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  // Read the resolved theme after mount. Rendering the icon from state that is
  // only known client-side would otherwise mismatch the server HTML.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing can block storage; the toggle still works for this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)]"
    >
      {/* Both icons are rendered and swapped with CSS so the button is correct
          on the server pass, before the resolved theme is known. */}
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block dark:hidden"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden dark:block"
        aria-hidden
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}

/**
 * Runs before the first paint to avoid a flash of the wrong theme. Inlined in
 * <head>, so it must not depend on any bundle having loaded.
 */
export const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_KEY}');
    var dark = stored ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
