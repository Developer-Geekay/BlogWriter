import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'blogwriter_session';
const SESSION_SECRET_ENV = 'SESSION_SECRET';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

/**
 * A weak signing key makes the session cookie forgeable, so a short or missing
 * secret is a hard failure rather than a warning.
 */
function secret(): Uint8Array {
  const value = process.env[SESSION_SECRET_ENV];
  if (!value || value.length < 32) {
    throw new SessionError(
      `${SESSION_SECRET_ENV} must be set to at least 32 characters. ` +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/** Logged once per process; a per-request message would bury the rest of the log. */
let misconfigurationReported = false;

/** Returns null for anything not currently valid — expired, tampered, or absent. */
export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  let key: Uint8Array;
  try {
    key = secret();
  } catch (err) {
    // A missing secret is a server misconfiguration, not a signed-out reader,
    // but it has to degrade like one: this runs in the root layout for every
    // visitor, and the public site should not break because the admin side is
    // misconfigured. The cost is that sign-in fails with no visible reason, so
    // say it in the log — that is the only place an operator can find it.
    if (!misconfigurationReported) {
      misconfigurationReported = true;
      console.error(`[auth] Sessions cannot be verified: ${(err as Error).message}`);
    }
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: String(payload['email'] ?? ''),
      name: String(payload['name'] ?? ''),
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
  // Secure cookies are dropped over plain HTTP, which would break local dev.
  secure: process.env.NODE_ENV === 'production',
} as const;
