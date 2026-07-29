/**
 * Slug generation and validation.
 *
 * The constraint is set by the blog API, not by us: slugs must match
 * `^[a-z0-9][a-z0-9-]{0,100}$` — lowercase alphanumerics and hyphens, first
 * character alphanumeric, at most 101 characters total.
 *
 * We validate locally before ever sending a request so a bad slug surfaces at
 * draft time with a clear message, rather than as a 400 during publish.
 */

/** Mirrors the server-side check in `src/app/api/posts/route.ts`. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,100}$/;

/** Total slug length the API accepts (1 leading char + up to 100 more). */
export const SLUG_MAX_LENGTH = 101;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export class InvalidSlugError extends Error {
  constructor(readonly slug: string, reason: string) {
    super(`Invalid slug ${JSON.stringify(slug)}: ${reason}`);
    this.name = 'InvalidSlugError';
  }
}

export function assertValidSlug(slug: string): void {
  if (slug.length === 0) throw new InvalidSlugError(slug, 'slug is empty');
  if (slug.length > SLUG_MAX_LENGTH) {
    throw new InvalidSlugError(slug, `longer than ${SLUG_MAX_LENGTH} characters`);
  }
  if (!isValidSlug(slug)) {
    throw new InvalidSlugError(
      slug,
      'must be lowercase alphanumerics and hyphens, starting with a letter or digit',
    );
  }
}

/**
 * Derive an API-valid slug from a title.
 *
 * Accents are folded to ASCII (via NFD normalisation) rather than dropped, so
 * "Métricas" becomes "metricas" instead of "mtricas". Truncation trims back to
 * a word boundary where possible so we don't end up with a severed word.
 */
export function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accent marks
    .toLowerCase()
    .replace(/['\u2019]/g, '') // don't turn "don't" into "don-t"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base.length === 0) {
    throw new InvalidSlugError(title, 'title contains no slug-safe characters');
  }

  return trimToSlugLength(base);
}

function trimToSlugLength(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;

  const hard = slug.slice(0, SLUG_MAX_LENGTH);
  const lastHyphen = hard.lastIndexOf('-');

  // Prefer cutting at a word boundary, but only if that leaves a usable slug.
  const candidate = lastHyphen > SLUG_MAX_LENGTH / 2 ? hard.slice(0, lastHyphen) : hard;
  return candidate.replace(/-+$/g, '');
}

/**
 * Append a numeric suffix until the slug is unique among `taken`, keeping the
 * result inside the length limit.
 */
export function uniqueSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(desired)) return desired;

  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const trimmed = desired.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, '');
    const candidate = `${trimmed}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  throw new InvalidSlugError(desired, 'could not find a unique variant');
}
