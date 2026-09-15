'use client';

import { useEffect, useState } from 'react';

export const THEME_KEY = 'blog-theme';

/**
 * Applied before first paint by the inline script in the layout, and again here
 * whenever the choice changes. Kept in one place so the two cannot drift.
 *
 * `data-theme` on <html> rather than a class: the design system's dark block is
 * an attribute selector, and driving it from an attribute means the CSS is the
 * only thing that needs to know how the theme is represented.
 */
function apply(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  // Read the resolved theme after mount. Rendering the icon from state that is
  // only known client-side would otherwise mismatch the server HTML.
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
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
      className="flex h-9 w-9 flex-none items-center justify-center border-2 border-[var(--soft)] text-[var(--ink)] transition-colors hover:bg-[var(--panel)]"
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
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;
