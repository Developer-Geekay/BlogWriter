import Link from 'next/link';
import { PostStore } from '@/src/db/posts';
import { SettingsStore } from '@/src/db/settings';
import { PostCard } from '@/components/PostCard';
import { TypewriterThoughts } from '@/components/TypewriterThoughts';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';
import { currentSession } from '@/src/auth/guard';
import { entryNumber } from '@/src/db/types';

// Posts change when the author publishes, so never serve a cached shell.
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ topic?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const topic = (await searchParams).topic?.trim() ?? '';

  let posts;
  let tags;
  let author = '';

  try {
    const store = await PostStore.open();
    [posts, tags, author] = await Promise.all([
      store.list({ status: 'published', limit: 50, ...(topic ? { tag: topic } : {}) }),
      store.tags(),
      (await SettingsStore.open()).get().then((s) => s.siteAuthor),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  // Nothing published at all — not merely nothing under this filter — gives the
  // page over to a thought instead of rendering an empty feed and empty rail.
  if (posts.length === 0 && !topic) {
    const session = await currentSession();
    return (
      <div className="mx-auto max-w-[1160px] px-4 py-24">
        <p className="mb-6 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
          Nothing published yet
        </p>
        <TypewriterThoughts />
        {/* Only the author can act on this; readers are not shown a control
            they cannot use, which is why there is no public sign-in link. */}
        {session ? (
          <Link
            href="/admin/posts/new"
            className="btn btn-primary mt-10 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em] no-underline"
          >
            Write the first entry
          </Link>
        ) : null}
      </div>
    );
  }

  // The banner names the piece being actively worked on. Derived from the
  // maturity taxonomy rather than pinned by hand, so it cannot go stale: the
  // most recently touched "growing" entry is, by definition, the current one.
  const growing = posts.find((p) => p.maturity === 'growing');

  return (
    <div className="mx-auto max-w-[1160px] px-4">
      <section className="border-b-2 border-[var(--rule)] pb-6 pt-8">
        <p className="mb-3.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--accent-text)]">
          Engineering log — {posts.length} {posts.length === 1 ? 'entry' : 'entries'}
        </p>
        <h1 className="mb-4 max-w-[15ch] text-[clamp(34px,9vw,68px)] font-extrabold leading-[0.96] tracking-[-0.035em]">
          Notes from the build.
        </h1>
        <p className="max-w-[52ch] text-[17px] text-[var(--muted)] [text-wrap:pretty]">
          {author ? `${author} — ` : ''}everything learned shipping platforms, written down while
          it is still true. Filed by topic and by how finished it is, not by date.
        </p>
      </section>

      {tags.length > 0 ? (
        <section className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--soft)] py-3.5">
          <span className="mr-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Filter
          </span>
          <Chip href="/" label="All" active={!topic} />
          {tags.map(({ tag }) => (
            <Chip
              key={tag}
              href={`/?topic=${encodeURIComponent(tag)}`}
              label={tag}
              active={topic === tag}
            />
          ))}
        </section>
      ) : null}

      <section>
        {posts.length === 0 ? (
          <p className="py-16 text-[var(--muted)]">
            Nothing filed under “{topic}” yet.{' '}
            <Link href="/" className="text-[var(--accent-text)] underline">
              See everything
            </Link>
            .
          </p>
        ) : (
          posts.map((post, index) => (
            <PostCard key={post.id} post={post} number={entryNumber(index, posts.length)} />
          ))
        )}
      </section>

      {growing ? (
        <section className="border-b-2 border-[var(--rule)] py-10">
          {/* Text on an accent field is the ground colour, not white. The
              accent is operator-chosen, and one of the options is near-white in
              dark mode — white on white. `--ground` always contrasts with it
              because that is the pair each palette entry was tuned against. */}
          <div className="bg-[var(--accent)] px-5 py-7 text-[var(--ground)]">
            <p className="mb-2.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.14em]">
              Currently growing
            </p>
            <p className="mb-4 max-w-[22ch] text-[clamp(24px,5.5vw,40px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              {growing.title}
            </p>
            <Link
              href={`/blog/${growing.slug}`}
              className="inline-block bg-[var(--ground)] px-3.5 py-2.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.1em] text-[var(--accent-text)] no-underline hover:opacity-90"
            >
              Read it →
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/*
 * The selected filter is a solid accent fill, not the pale `tag-accent` tint.
 *
 * The tint is a 100-step wash — against the neutral chips beside it the
 * difference is a few percent of pink, which does not read as "this one is on",
 * especially when a site has few enough entries that filtering changes little
 * on screen. The design system already uses a solid accent for a *chosen*
 * option (`.seg-opt:has(input:checked)`), so this borrows that rather than
 * inventing a state.
 */
function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`tag font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] no-underline ${
        active
          ? 'bg-[var(--accent)] text-[var(--ground)]'
          : 'tag-neutral hover:bg-[var(--color-neutral-300)]'
      }`}
    >
      {label}
    </Link>
  );
}
