import Link from 'next/link';
import { currentSession } from '@/src/auth/guard';
import { SignOutButton } from '@/components/SignOutButton';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();

  // The login page renders inside this layout but has no session yet.
  if (!session) return <>{children}</>;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-rule)] pb-4 dark:border-neutral-800">
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/admin" className="hover:text-[var(--color-accent)]">
            Posts
          </Link>
          <Link href="/admin/posts/new" className="hover:text-[var(--color-accent)]">
            New post
          </Link>
          <Link href="/admin/settings" className="hover:text-[var(--color-accent)]">
            Settings
          </Link>
          <Link href="/" className="text-[var(--color-muted)] hover:text-[var(--color-accent)]">
            View site
          </Link>
        </nav>
        <div className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
          <span>{session.name || session.email}</span>
          <SignOutButton />
        </div>
      </div>

      <div className="pt-8">{children}</div>
    </div>
  );
}
