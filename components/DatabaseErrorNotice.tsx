import { DatabaseError } from '@/src/db/client';

/**
 * Shown instead of a page when storage is unreachable.
 *
 * Every public page renders through this rather than throwing, so a missing or
 * wrong `MONGODB_URI` produces a readable explanation instead of a generic
 * "something went wrong" screen with the cause buried in the server log.
 */
export function DatabaseErrorNotice({ error }: { error: DatabaseError }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24">
      <h1 className="text-2xl font-bold tracking-tight">The database is not reachable</h1>
      <p className="mt-3 whitespace-pre-line text-[var(--color-muted)]">{error.message}</p>
    </div>
  );
}

/** Rethrows anything that is not a storage failure, so real bugs stay visible. */
export function asDatabaseError(err: unknown): DatabaseError {
  if (err instanceof DatabaseError) return err;
  throw err;
}
