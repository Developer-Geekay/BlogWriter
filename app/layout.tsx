import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsStore } from '@/src/db/settings';
import './globals.css';

/**
 * Site title and description come from the settings document so an operator can
 * change them in the portal without a redeploy. If the database is unreachable
 * we still render — a broken connection should not take the whole site down
 * before the error page can explain itself.
 */
async function siteMeta(): Promise<{ title: string; description: string }> {
  try {
    const settings = await (await SettingsStore.open()).get();
    return { title: settings.siteTitle, description: settings.siteDescription };
  } catch {
    return { title: 'BlogWriter', description: 'Writing about software.' };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await siteMeta();
  return {
    title: { default: title, template: `%s — ${title}` },
    description,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { title } = await siteMeta();

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-[var(--color-rule)] dark:border-neutral-800">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
            <Link href="/" className="text-xl font-bold tracking-tight">
              {title}
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="hover:text-[var(--color-accent)]">
                Home
              </Link>
              <Link
                href="/admin"
                className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-white hover:opacity-90"
              >
                Write
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-[var(--color-rule)] dark:border-neutral-800">
          <div className="mx-auto max-w-5xl px-5 py-8 text-sm text-[var(--color-muted)]">
            {title}
          </div>
        </footer>
      </body>
    </html>
  );
}
