import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UserStore } from '@/src/db/users';
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/src/auth/session';

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
}
