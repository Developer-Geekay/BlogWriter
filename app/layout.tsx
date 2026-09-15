import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { SettingsStore } from '@/src/db/settings';
import { currentSession } from '@/src/auth/guard';
import { Analytics } from '@/components/Analytics';
import { BrandLogo } from '@/components/BrandLogo';
import { HeaderControls } from '@/components/HeaderControls';
import { SiteFooter } from '@/components/SiteFooter';
import { themeScript } from '@/components/ThemeToggle';
import { DEFAULT_ACCENT_ID, accentById, accentCss } from '@/src/theme/accents';
import './globals.css';

/**
 * Archivo is the whole type system — headings and body both. Loaded here rather
 * than through the `@import` the design system's stylesheet ships with, which
 * would be a render-blocking request to a third party; this self-hosts it and
 * removes the swap. The weights are the three the design uses: 400 body, 600
 * for medium emphasis, 800 for every heading.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  display: 'swap',
  variable: '--font-archivo',
});

/**
 * Site title and description come from the settings document so an operator can
 * change them in the portal without a redeploy. If the database is unreachable
 * we still render — a broken connection should not take the whole site down
 * before the error page can explain itself.
 */
async function siteMeta(): Promise<{
  title: string;
  description: string;
  author: string;
  accent: string;
}> {
  try {
    const settings = await (await SettingsStore.open()).get();
    return {
      title: settings.siteTitle,
      description: settings.siteDescription,
      author: settings.siteAuthor,
      accent: settings.siteAccent,
    };
  } catch {
    return {
      title: 'Scratchpad',
      description: '',
      author: 'Gokulakannan',
      accent: DEFAULT_ACCENT_ID,
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
  const { title, author, accent } = await siteMeta();
  // Writing is single-author, so the compose entry point is only shown to the
  // signed-in owner. Readers never see a control they cannot use.
  const session = await currentSession();

  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* The chosen accent, as a stylesheet rather than an inline style —
            see the note on accentCss for why that distinction matters. */}
        <style dangerouslySetInnerHTML={{ __html: accentCss(accentById(accent)) }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* A hard 2px rule under the header, and no backdrop blur — the design
            is flat, so the header sits on the ground colour rather than
            floating above a translucent copy of the page. */}
        <header className="sticky top-0 z-40 border-b-2 border-[var(--rule)] bg-[var(--ground)]">
          {/* `flex-wrap` so the nav row inside HeaderControls can take a line of
              its own below the brand and controls, as the design has it. */}
          <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-2 px-4 py-2.5">
            <BrandLogo title={title} />

            {/* The controls keep their natural width and the brand absorbs the
                difference by truncating — the reverse pushes them off the right
                edge of a phone. Which controls appear depends on whether this
                is the portal or the public site, which is a client-side
                question; see components/HeaderControls.tsx. */}
            <HeaderControls signedIn={Boolean(session)} />
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <SiteFooter siteName={title} author={author} />
        <Analytics />
      </body>
    </html>
  );
}
