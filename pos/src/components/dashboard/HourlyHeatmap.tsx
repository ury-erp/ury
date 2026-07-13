import { useMemo, useState } from 'react';
import { useDashboardStore } from '../../store/dashboard-store';
import { t } from '../../i18n';
import { cn } from '../../lib/utils';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

const HourlyHeatmap = () => {
  const { summary } = useDashboardStore();
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const heatmapData = useMemo(() => {
    if (!summary?.hourly_breakdown) return { cells: [] as HeatmapCell[], maxCount: 0 };

    const cells: HeatmapCell[] = [];
    let maxCount = 0;

    // Check if the data includes day information
    const hasDayInfo = summary.hourly_breakdown.some(
      (item: { day?: number; day_of_week?: number; hour: number; order_count: number }) => item.day !== undefined || item.day_of_week !== undefined
    );

    for (const item of summary.hourly_breakdown) {
      const hour = Number(item.hour) || 0;
      const count = Number(item.order_count) || 0;
      const day = Number(item.day ?? item.day_of_week ?? 0);

      if (count > maxCount) maxCount = count;

      if (hasDayInfo) {
        cells.push({ day, hour, count });
      } else {
        // If no day info, distribute across all days with same pattern
        for (let d = 0; d < 7; d++) {
          cells.push({ day: d, hour, count });
        }
      }
    }

    return { cells, maxCount };
  }, [summary?.hourly_breakdown]);

  const getCellColor = (count: number, maxCount: number) => {
    if (maxCount === 0) return 'bg-blue-50';
    const intensity = count / maxCount;
    if (intensity === 0) return 'bg-blue-50';
    if (intensity < 0.15) return 'bg-blue-100';
    if (intensity < 0.3) return 'bg-blue-200';
    if (intensity < 0.45) return 'bg-blue-300';
    if (intensity < 0.6) return 'bg-blue-400';
    if (intensity < 0.75) return 'bg-blue-500';
    if (intensity < 0.9) return 'bg-blue-600';
    return 'bg-blue-700';
  };

  const getCellTextColor = (count: number, maxCount: number) => {
    if (maxCount === 0) return 'text-blue-300';
    const intensity = count / maxCount;
    if (intensity >= 0.6) return 'text-white';
    return 'text-blue-800';
  };

  const getCellCount = (day: number, hour: number) => {
    return heatmapData.cells.find((c) => c.day === day && c.hour === hour)?.count || 0;
  };

  const legendSteps = [
    { label: '0', color: 'bg-blue-50' },
    { label: 'Low', color: 'bg-blue-200' },
    { label: 'Med', color: 'bg-blue-400' },
    { label: 'High', color: 'bg-blue-600' },
    { label: 'Peak', color: 'bg-blue-700' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        {t('dashboard.hourly_heatmap')}
      </h3>

      {heatmapData.cells.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          {t('dashboard.no_data_available')}
        </div>
      ) : (
        <div className="relative">
          {/* Tooltip */}
          {hoveredCell && (
            <div className="absolute z-10 bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2 pointer-events-none"
              style={{
                top: '0px',
                right: '0px',
              }}
            >
              <p className="text-xs font-medium text-gray-900">
                {DAYS_OF_WEEK[hoveredCell.day]} {hoveredCell.hour}:00 - {hoveredCell.hour + 1}:00
              </p>
              <p className="text-xs text-gray-500">
                {hoveredCell.count} orders
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            {/* Hour labels */}
            <div className="flex items-end ml-10 mb-1">
              {HOURS.filter((h) => h % 2 === 0).map((h) => (
                <div
                  key={h}
                  className="text-center"
                  style={{ width: `${100 / 12}%`, minWidth: '20px' }}
                >
                  <span className="text-[10px] text-gray-400">{h}</span>
                </div>
              ))}
            </div>

            {/* Heatmap grid */}
            <div className="space-y-0.5">
              {DAYS_OF_WEEK.map((day, dayIndex) => (
                <div key={day} className="flex items-center gap-0.5">
                  <div className="w-10 shrink-0 text-right pr-1">
                    <span className="text-[10px] text-gray-500">{day}</span>
                  </div>
                  <div className="flex gap-0.5 flex-1">
                    {HOURS.map((hour) => {
                      const count = getCellCount(dayIndex, hour);
                      return (
                        <div
                          key={hour}
                          className={cn(
                            'flex-1 aspect-square min-w-[14px] min-h-[14px] rounded-sm cursor-pointer transition-all duration-100 flex items-center justify-center',
                            getCellColor(count, heatmapData.maxCount),
                            hoveredCell?.day === dayIndex && hoveredCell?.hour === hour
                              ? 'ring-2 ring-blue-400 scale-110'
                              : ''
                          )}
                          onMouseEnter={() => setHoveredCell({ day: dayIndex, hour, count })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          {count > 0 && (
                            <span className={cn('text-[8px] leading-none font-medium', getCellTextColor(count, heatmapData.maxCount))}>
                              {count >= 100 ? `${Math.round(count / 10)}` : count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-[10px] text-gray-400 mr-1">Less</span>
            {legendSteps.map((step) => (
              <div key={step.label} className="flex items-center gap-1">
                <div className={cn('w-3 h-3 rounded-sm', step.color)} />
              </div>
            ))}
            <span className="text-[10px] text-gray-400 ml-1">More</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HourlyHeatmap;
