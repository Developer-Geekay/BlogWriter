import { headers } from 'next/headers';
import { SettingsStore } from '@/src/db/settings';
import { McpSettings } from '@/components/McpSettings';
import { SiteSettings } from '@/components/SiteSettings';
import { AccentSettings } from '@/components/AccentSettings';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  let settings;
  try {
    settings = await (await SettingsStore.open()).getPublic();
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  // Build the endpoint the operator should paste into an external client. Prefer
  // an explicit SITE_URL; otherwise derive it from the request, which is right
  // in development and behind a proxy that sets the forwarded headers.
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const proto =
    requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = process.env['SITE_URL']?.replace(/\/+$/, '') ?? `${proto}://${host}`;

  return (
    <div>
      <section className="border-b-2 border-[var(--rule)] pb-4 pt-6">
        <h1 className="text-[clamp(26px,6vw,38px)] font-extrabold tracking-[-0.03em]">Settings</h1>
      </section>

      <section className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <SiteSettings initial={settings} />
        <AccentSettings initial={settings} />
        <McpSettings initial={settings} endpoint={`${base}/api/mcp`} />
      </section>
    </div>
  );
}
