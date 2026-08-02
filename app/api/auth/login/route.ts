import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UserStore } from '@/src/db/users';
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
  SessionError,
} from '@/src/auth/session';
import { storageFailure } from '@/src/api/errors';

export const runtime = 'nodejs';

const LoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  try {
    const users = await UserStore.open();

    // Nothing to sign in to yet — say so plainly rather than "wrong password",
    // which would send someone hunting for a password that does not exist.
    if ((await users.count()) === 0) {
      return NextResponse.json(
        { error: 'No admin account exists yet. Run: npm run create-admin' },
        { status: 409 },
      );
    }

    const user = await users.verify(parsed.data.email, parsed.data.password);
    if (!user) {
      // Deliberately the same message for a bad email and a bad password.
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json({ user: { email: user.email, name: user.name } });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (err) {
    // The credentials were right and the sign-in still failed. Without this the
    // browser gets a bare 500 and the form shows "Could not sign in", which is
    // indistinguishable from a wrong password — the single most misleading way
    // for a deployment to be broken.
    if (err instanceof SessionError) {
      return NextResponse.json(
        { error: `The server is not configured for sign-in: ${err.message}` },
        { status: 503 },
      );
    }
    return storageFailure(err);
  }
}
