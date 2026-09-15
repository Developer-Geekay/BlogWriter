import type { DailyReads } from '@/src/db/views';

/**
 * The 14-day reads bar chart.
 *
 * Bars are scaled against the window's own peak, not an absolute ceiling — the
 * chart answers "which days were busy relative to each other", which is the
 * only question a 14-bar strip with no axis can honestly answer. The peak value
 * is printed underneath so the shape has a number attached to it.
 *
 * An all-zero window renders the baseline and nothing else rather than fourteen
 * full-height bars, which is what dividing by a zero maximum would produce.
 */
export function Sparkline({ series }: { series: DailyReads[] }) {
  const peak = Math.max(...series.map((d) => d.reads), 0);

  return (
    <div
      className="flex h-[120px] items-end gap-1 border-b-2 border-[var(--rule)]"
      role="img"
      aria-label={
        peak === 0
          ? 'Reads over the last 14 days: no reads recorded'
          : `Reads over the last 14 days, peaking at ${peak}`
      }
    >
      {series.map((day) => (
        <div
          key={day.date}
          title={`${day.date}: ${day.reads} ${day.reads === 1 ? 'read' : 'reads'}`}
          className="flex-1 bg-[var(--accent)]"
          // `1px` rather than 0 for an empty day: a day with no reads should
          // still occupy its slot, so the strip reads as a timeline instead of
          // silently collapsing to only the days that had traffic.
          style={{ height: peak === 0 ? '1px' : `${Math.max(1, (day.reads / peak) * 100)}%` }}
        />
      ))}
    </div>
  );
}
