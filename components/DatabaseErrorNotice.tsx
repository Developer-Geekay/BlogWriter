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
    <div className="mx-auto max-w-2xl px-4 py-24">
      <p className="mb-3 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
        Storage unavailable
      </p>
      <h1 className="mb-3 text-[clamp(28px,6vw,42px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
        The database is not reachable
      </h1>
      <p className="whitespace-pre-line text-[var(--muted)]">{error.message}</p>
    </div>
  );
}

/** Rethrows anything that is not a storage failure, so real bugs stay visible. */
export function asDatabaseError(err: unknown): DatabaseError {
  if (err instanceof DatabaseError) return err;
  throw err;
}
