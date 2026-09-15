/**
 * Where the admin portal lives, as far as the client is concerned.
 *
 * The header is rendered by the root layout for every page, portal included,
 * but it must not offer the same controls in both places: reader-facing search
 * and the compose button make no sense inside the portal, and sign-out makes
 * none outside it. Both the header and the analytics gate need to answer the
 * same question, so the answer is defined once here rather than as two
 * prefix checks that can drift apart.
 */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * The sign-in page.
 *
 * It lives under `/admin` but is not yet the portal: whoever is looking at it
 * has no session, so portal navigation would be six links that all bounce
 * straight back here. Named once so the header and anything else that needs to
 * tell "the portal" from "the door to it" agree.
 */
export const ADMIN_LOGIN_PATH = '/admin/login';

export function isAdminLoginPath(pathname: string): boolean {
  return pathname === ADMIN_LOGIN_PATH;
}
