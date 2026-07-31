import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken, type SessionPayload } from './session.js';

/** The signed-in user for the current request, or null. */
export async function currentSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for route handlers. Returns either the session or the 401 to return —
 * the caller checks which, so authorisation cannot be forgotten silently.
 *
 *   const auth = await requireSession();
 *   if (!auth.ok) return auth.response;
 */
export async function requireSession(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await currentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }),
    };
  }
  return { ok: true, session };
}
