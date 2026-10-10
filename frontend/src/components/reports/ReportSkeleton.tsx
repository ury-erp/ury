import { Skeleton } from '@ury/ui';

interface ReportSkeletonProps {
  /** Summary tiles to mock. Match the page's own grid so nothing shifts. */
  tiles?: number;
  /** Include a chart-height block below the tiles. */
  chart?: boolean;
  /** Include a table block. Omit when the page's DataTable renders its own. */
  table?: boolean;
}

/**
 * Loading state for a report page.
 *
 * Replaces the bare "Loading…" line every report used to render, which
 * collapsed the page to a single row of text and then snapped the full layout
 * in when data arrived. Mirroring the real structure keeps the page still.
 *
 * The page's DataTable already draws its own skeleton rows from `isLoading`,
 * so `table` defaults to false to avoid two stacked placeholders.
 */
export function ReportSkeleton({ tiles = 4, chart = false, table = false }: ReportSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-card p-5 shadow-sm">
            <Skeleton shape="text" className="w-24" />
            <Skeleton shape="heading" className="mt-3 w-20" />
          </div>
        ))}
      </div>

      {chart ? <Skeleton shape="block" className="h-64 w-full" /> : null}
      {table ? <Skeleton shape="block" className="h-72 w-full" /> : null}
    </div>
  );
}

export default ReportSkeleton;
