import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/src/auth/session';

/**
 * Gate the admin portal.
 *
 * This runs before any admin page renders, so an unauthenticated visitor is
 * redirected rather than briefly seeing a shell. The API routes check the
 * session again themselves — middleware is a convenience for navigation, not
 * the only line of defence.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/admin/login') return NextResponse.next();

  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const login = new URL('/admin/login', request.url);
  // Remember where they were headed so login can send them back.
  login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/admin/:path*'],
};
