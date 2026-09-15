export const dynamic = 'force-dynamic';

/**
 * The portal is a width and a gutter, nothing more.
 *
 * Navigation used to live here as a second row of links. It now sits in the
 * site header alongside the reader chrome — one header, one place controls
 * appear — so this layout has no chrome of its own left to draw.
 *
 * Deliberately no session check. `/admin/login` is inside this segment, so a
 * guard here renders the login page as a blank frame for exactly the visitor
 * who needs it: signed out, sent here by middleware, and now with nothing to
 * sign in to. Access is enforced where it belongs — `middleware.ts` gates every
 * `/admin/*` path except the login page, and each API route re-checks the
 * session itself.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1160px] px-4 pb-14">{children}</div>;
}
