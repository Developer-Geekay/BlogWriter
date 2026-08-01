import { NextResponse } from 'next/server';
import { DatabaseError } from '../db/client.js';

/**
 * Turn a storage outage into a readable 503.
 *
 * Every route here opens a store before it can do anything, so an unreachable
 * database surfaces as the first thing that throws. Without this the framework
 * returns a bare 500 and the reason is only visible in the server log — the
 * pages and the MCP endpoint already degrade properly, and the JSON API should
 * behave the same.
 *
 * Anything that is not a storage failure is rethrown, so real bugs stay loud.
 */
export function storageFailure(err: unknown): NextResponse {
  if (err instanceof DatabaseError) {
    return NextResponse.json(
      { error: `Storage is unavailable: ${err.message}` },
      { status: 503 },
    );
  }
  throw err;
}
