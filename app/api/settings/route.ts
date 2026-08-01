import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SettingsStore } from '@/src/db/settings';
import { requireSession } from '@/src/auth/guard';
import { storageFailure } from '@/src/api/errors';

export const runtime = 'nodejs';

const SettingsPatchSchema = z.object({
  siteTitle: z.string().trim().min(1).optional(),
  siteDescription: z.string().trim().optional(),
  siteAuthor: z.string().trim().optional(),
  mcpEnabled: z.boolean().optional(),
  mcpAllowPublish: z.boolean().optional(),
  /** Ask for a brand new bearer token; the previous one stops working at once. */
  rotateMcpToken: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ settings: await (await SettingsStore.open()).getPublic() });
  } catch (err) {
    return storageFailure(err);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const parsed = SettingsPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid settings.', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { mcpEnabled, rotateMcpToken, ...rest } = parsed.data;

  try {
    const store = await SettingsStore.open();
    if (Object.keys(rest).length > 0) await store.update(rest);

    // Enabling mints a token if none exists, so the endpoint is never open.
    if (mcpEnabled !== undefined) await store.setMcpEnabled(mcpEnabled);

    // The freshly minted token is returned exactly once, here, so the operator
    // can copy it into the external portal. It is not readable afterwards.
    let token: string | undefined;
    if (rotateMcpToken) token = await store.rotateMcpToken();

    return NextResponse.json({
      settings: await store.getPublic(),
      ...(token ? { mcpToken: token } : {}),
    });
  } catch (err) {
    return storageFailure(err);
  }
}
