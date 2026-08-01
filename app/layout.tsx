import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsStore } from '@/src/db/settings';
import { currentSession } from '@/src/auth/guard';
import { Analytics } from '@/components/Analytics';
import { BrandLogo } from '@/components/BrandLogo';
import { SearchBox } from '@/components/SearchBox';
import { ThemeToggle, themeScript } from '@/components/ThemeToggle';
import './globals.css';

/**
 * Site title and description come from the settings document so an operator can
 * change them in the portal without a redeploy. If the database is unreachable
 * we still render — a broken connection should not take the whole site down
 * before the error page can explain itself.
 */
async function siteMeta(): Promise<{ title: string; description: string; author: string }> {
  try {
    const settings = await (await SettingsStore.open()).get();
    return {
      title: settings.siteTitle,
      description: settings.siteDescription,
      author: settings.siteAuthor,
    };
  } catch {
    return {
      title: 'Scratchpad',
      description: '',
      author: 'Gokulakannan',
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await siteMeta();
  return {
    title: { default: title, template: `%s — ${title}` },
    // An empty description is worse than none: omit the tag rather than
    // shipping `<meta name="description" content="">`.
    ...(description ? { description } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { title, author } = await siteMeta();
  // Writing is single-author, so the compose entry point is only shown to the
  // signed-in owner. Readers never see a control they cannot use.
  const session = await currentSession();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 border-b border-[var(--color-rule)] bg-[var(--color-surface)]/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
            <BrandLogo title={title} author={author} />

            <nav className="flex items-center gap-2 sm:gap-3">
              <SearchBox />
              <ThemeToggle />
              {/* The single compose entry point in the whole app. The admin
                  nav and dashboard used to repeat it; one control, one place. */}
              {session ? (
                <Link
                  href="/admin/posts/new"
                  className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Write
                </Link>
              ) : null}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <Analytics />
      </body>
    </html>
  );
}
