import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, readSessionToken, SessionError } from '../src/auth/session.js';

const GOOD_SECRET = 'a'.repeat(48);
const original = process.env['SESSION_SECRET'];

beforeEach(() => {
  process.env['SESSION_SECRET'] = GOOD_SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env['SESSION_SECRET'];
  else process.env['SESSION_SECRET'] = original;
});

describe('session tokens', () => {
  it('round-trips the signed-in user', async () => {
    const token = await createSessionToken({
      userId: '507f1f77bcf86cd799439011',
      email: 'author@example.com',
      name: 'Author',
    });

    expect(await readSessionToken(token)).toEqual({
      userId: '507f1f77bcf86cd799439011',
      email: 'author@example.com',
      name: 'Author',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken({ userId: '1', email: 'a@b.c', name: 'A' });
    process.env['SESSION_SECRET'] = 'b'.repeat(48);

    expect(await readSessionToken(token)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await createSessionToken({ userId: '1', email: 'a@b.c', name: 'A' });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', email: 'evil@example.com' }))
      .toString('base64url');

    expect(await readSessionToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('treats a missing cookie as signed out rather than throwing', async () => {
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken('')).toBeNull();
    expect(await readSessionToken('not-a-jwt')).toBeNull();
  });

  // A short secret is brute-forceable, which would make the cookie forgeable.
  it('refuses to sign with a weak or missing secret', async () => {
    process.env['SESSION_SECRET'] = 'too-short';
    await expect(createSessionToken({ userId: '1', email: 'a', name: 'A' })).rejects.toThrow(
      SessionError,
    );

    delete process.env['SESSION_SECRET'];
    await expect(createSessionToken({ userId: '1', email: 'a', name: 'A' })).rejects.toThrow(
      SessionError,
    );
  });
});
