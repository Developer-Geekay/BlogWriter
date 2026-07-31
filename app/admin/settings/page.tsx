import { headers } from 'next/headers';
import { SettingsStore } from '@/src/db/settings';
import { McpSettings } from '@/components/McpSettings';
import { SiteSettings } from '@/components/SiteSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const settings = await (await SettingsStore.open()).getPublic();

  // Build the endpoint the operator should paste into an external client. Prefer
  // an explicit SITE_URL; otherwise derive it from the request, which is right
  // in development and behind a proxy that sets the forwarded headers.
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const proto = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = process.env['SITE_URL']?.replace(/\/+$/, '') ?? `${proto}://${host}`;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <SiteSettings initial={settings} />
      <McpSettings initial={settings} endpoint={`${base}/api/mcp`} />
    </div>
  );
}
