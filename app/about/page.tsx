import type { Metadata } from 'next';
import { SettingsStore } from '@/src/db/settings';
import { DatabaseErrorNotice, asDatabaseError } from '@/components/DatabaseErrorNotice';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'About' };

export default async function AboutPage() {
  let settings;
  try {
    settings = await (await SettingsStore.open()).get();
  } catch (err) {
    return <DatabaseErrorNotice error={asDatabaseError(err)} />;
  }

  const { siteAuthor, siteRole, siteBio, siteDescription } = settings;
  // The bio is the page. Falling back to the site description keeps the page
  // from being empty on a fresh install without inventing a biography.
  const body = siteBio || siteDescription;

  return (
    <div className="mx-auto max-w-[1160px] px-4">
      <section className="grid gap-6 pb-10 pt-7 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <div>
          <h1 className="mb-4 text-[clamp(30px,7.5vw,48px)] font-extrabold leading-[1.03] tracking-[-0.035em]">
            {siteAuthor || 'About'}
          </h1>

          {siteRole ? (
            <p className="mb-4 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.12em] text-[var(--accent-text)]">
              {siteRole}
            </p>
          ) : null}

          {body ? (
            <p className="max-w-[50ch] text-[17px] leading-[1.6] [text-wrap:pretty]">{body}</p>
          ) : (
            <p className="max-w-[50ch] text-[17px] leading-[1.6] text-[var(--muted)]">
              Nothing written here yet.
            </p>
          )}
        </div>

        {/*
          The design puts a 4:5 black-and-white portrait beside the bio. There is
          no image store yet, so this is the slot it will occupy, drawn as a
          hatch rather than filled with a stock photograph that would have to be
          taken back out later.
        */}
        <div
          aria-hidden
          className="flex aspect-[4/5] items-end border-2 border-[var(--rule)] p-3.5 [background:repeating-linear-gradient(135deg,var(--panel)_0_9px,var(--ground)_9px_18px)]"
        >
          <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            Portrait slot — B&amp;W, 4:5
          </span>
        </div>
      </section>
    </div>
  );
}
