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

export default async function HomePage() {
  let posts;
  let author = '';

  try {
    const store = await PostStore.open();
    [posts, author] = await Promise.all([
      store.list({ status: 'published', limit: 50 }),
      (await SettingsStore.open()).get().then((s) => s.siteAuthor),
    ]);
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  // Nothing published gives the page over to a thought instead of rendering an
  // empty feed.
  if (posts.length === 0) {
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

      {/*
        No filter row here.

        It listed every tag in use, which is fine with three and unusable with
        thirty — in production it wrapped to two full rows above the first entry
        and pushed the writing off the screen. Filtering by topic still exists,
        on /topics and the individual /tag pages, where a long list has room to
        be laid out properly.
      */}
      <section>
        {posts.map((post, index) => (
          <PostCard key={post.id} post={post} number={entryNumber(index, posts.length)} />
        ))}
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

