import type { Collection, Db } from 'mongodb';
import { getDb } from './client.js';

/**
 * First-party read tracking.
 *
 * The site also reports visits to an external analytics platform, but that
 * integration is one-way — it accepts beacons and exposes no read API — so the
 * portal could never show its own numbers. This stores them here instead, in
 * the same database as everything else, which is the only way the dashboard and
 * the analytics screen can say anything true.
 *
 * Counters are bucketed by day and by post rather than stored per visit. A
 * personal blog does not need visit-level detail, and buckets keep the
 * collection small enough that the whole history stays cheap to aggregate:
 * one document per post per day, incremented in place.
 */
export interface ViewDocument {
  /** `${slug}|${date}` — makes the upsert idempotent without a second index. */
  _id: string;
  slug: string;
  /** UTC `YYYY-MM-DD`. */
  date: string;
  reads: number;
  /** Reads where the reader reached the end of the article. */
  finishes: number;
  /** Where the reader came from, classified from the referrer. */
  search: number;
  referral: number;
  direct: number;
}

export const VIEW_SOURCES = ['search', 'referral', 'direct'] as const;
export type ViewSource = (typeof VIEW_SOURCES)[number];

/** Hosts we treat as search engines when classifying a referrer. */
const SEARCH_HOSTS =
  /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|brave|startpage|qwant)\./i;

/**
 * Classify a referrer.
 *
 * Same-origin counts as direct rather than as a referral: a reader moving from
 * the index to an entry did not arrive from anywhere, and counting it as a
 * referral would make the site its own biggest traffic source.
 */
export function classifySource(referrer: string | undefined, selfHost?: string): ViewSource {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return 'direct';
  }
  if (selfHost && host === selfHost) return 'direct';
  if (SEARCH_HOSTS.test(host)) return 'search';
  return 'referral';
}

/** UTC day key. UTC, not local, so a server that moves timezone keeps one series. */
export function dayKey(when: Date = new Date()): string {
  return when.toISOString().slice(0, 10);
}

/** The last `days` day-keys, oldest first, including today. */
export function recentDays(days: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  return out;
}

export interface DailyReads {
  date: string;
  reads: number;
}

export interface PostReads {
  slug: string;
  reads: number;
}

export interface ReadTotals {
  reads: number;
  finishes: number;
  /** Whole percent, or null when there is nothing to divide by. */
  finishRate: number | null;
}

export class ViewStore {
  private constructor(private readonly views: Collection<ViewDocument>) {}

  static async open(db?: Db): Promise<ViewStore> {
    const database = db ?? (await getDb());
    return new ViewStore(database.collection<ViewDocument>('views'));
  }

  /**
   * Count one read, and optionally that the reader finished it.
   *
   * `finished` arrives as a second call for the same slug once the reader
   * reaches the end, so a finish increments only that counter — otherwise every
   * completed read would be counted twice.
   */
  async record(input: {
    slug: string;
    source?: ViewSource;
    finished?: boolean;
    when?: Date;
  }): Promise<void> {
    const date = dayKey(input.when);
    const inc: Partial<Record<keyof ViewDocument, number>> = input.finished
      ? { finishes: 1 }
      : { reads: 1, [input.source ?? 'direct']: 1 };

    await this.views.updateOne(
      { _id: `${input.slug}|${date}` },
      {
        $inc: inc as Record<string, number>,
        $setOnInsert: { slug: input.slug, date },
      },
      { upsert: true },
    );
  }

  /** Reads per day over the window, zero-filled so the chart has no gaps. */
  async dailySeries(days: number, now: Date = new Date()): Promise<DailyReads[]> {
    const window = recentDays(days, now);
    const rows = await this.views
      .aggregate<{ _id: string; reads: number }>([
        { $match: { date: { $gte: window[0]! } } },
        { $group: { _id: '$date', reads: { $sum: '$reads' } } },
      ])
      .toArray();

    const byDate = new Map(rows.map((r) => [r._id, r.reads]));
    return window.map((date) => ({ date, reads: byDate.get(date) ?? 0 }));
  }

  async totals(days: number, now: Date = new Date()): Promise<ReadTotals> {
    const since = recentDays(days, now)[0]!;
    const [row] = await this.views
      .aggregate<{ reads: number; finishes: number }>([
        { $match: { date: { $gte: since } } },
        { $group: { _id: null, reads: { $sum: '$reads' }, finishes: { $sum: '$finishes' } } },
      ])
      .toArray();

    const reads = row?.reads ?? 0;
    const finishes = row?.finishes ?? 0;
    return { reads, finishes, finishRate: reads > 0 ? Math.round((finishes / reads) * 100) : null };
  }

  async topPosts(days: number, limit = 5, now: Date = new Date()): Promise<PostReads[]> {
    const since = recentDays(days, now)[0]!;
    const rows = await this.views
      .aggregate<{ _id: string; reads: number }>([
        { $match: { date: { $gte: since } } },
        { $group: { _id: '$slug', reads: { $sum: '$reads' } } },
        { $sort: { reads: -1, _id: 1 } },
        { $limit: limit },
      ])
      .toArray();
    return rows.map((r) => ({ slug: r._id, reads: r.reads }));
  }

  async sources(days: number, now: Date = new Date()): Promise<Record<ViewSource, number>> {
    const since = recentDays(days, now)[0]!;
    const [row] = await this.views
      .aggregate<Record<ViewSource, number>>([
        { $match: { date: { $gte: since } } },
        {
          $group: {
            _id: null,
            search: { $sum: '$search' },
            referral: { $sum: '$referral' },
            direct: { $sum: '$direct' },
          },
        },
      ])
      .toArray();

    return {
      search: row?.search ?? 0,
      referral: row?.referral ?? 0,
      direct: row?.direct ?? 0,
    };
  }
}
