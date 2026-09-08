import { useMemo, useRef, useEffect, useState } from 'react';
import { Clock, User, Phone, BookLock } from 'lucide-react';
import { Badge } from '@ury/ui';
import type { Table, TableReservation } from '../lib/table-api';

interface TableReservationTimelineProps {
  tables?: Table[];
  reservations: TableReservation[];
  selectedDate: Date;
  onSelectReservation: (res: TableReservation) => void;
  loading?: boolean;
}

const HOUR_WIDTH = 120; // pixels per hour
const TOTAL_HOURS = 24; // 00:00 to 24:00
const TIMELINE_WIDTH = TOTAL_HOURS * HOUR_WIDTH;
const CARD_HEIGHT = 74; // Height of each reservation block
const LANE_GAP = 10; // Gap between vertical lanes

function parseReservationTime(raw?: string): { hours: number; minutes: number; totalMinutes: number; timeStr: string } {
  if (!raw) return { hours: 0, minutes: 0, totalMinutes: 0, timeStr: '00:00' };
  try {
    const d = new Date(raw.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      const h = d.getHours();
      const m = d.getMinutes();
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return { hours: h, minutes: m, totalMinutes: h * 60 + m, timeStr };
    }
  } catch {}
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return { hours: h, minutes: m, totalMinutes: h * 60 + m, timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }
  return { hours: 0, minutes: 0, totalMinutes: 0, timeStr: '00:00' };
}

interface PositionedReservation {
  reservation: TableReservation;
  startMinutes: number;
  durationMinutes: number;
  endMinutes: number;
  timeStr: string;
  endTimeStr: string;
  laneIndex: number;
  leftPx: number;
  widthPx: number;
  topPx: number;
}

export default function TableReservationTimeline({
  reservations,
  selectedDate,
  onSelectReservation,
  loading = false,
}: TableReservationTimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isToday = useMemo(() => {
    const now = new Date();
    return (
      now.getFullYear() === selectedDate.getFullYear() &&
      now.getMonth() === selectedDate.getMonth() &&
      now.getDate() === selectedDate.getDate()
    );
  }, [selectedDate]);

  // Position reservations using interval scheduling / lane allocation
  const positionedReservations = useMemo(() => {
    if (reservations.length === 0) return { items: [] as PositionedReservation[], totalLanes: 0 };

    const parsed = reservations.map((res) => {
      const timeInfo = parseReservationTime(res.reserved_at);
      const duration = res.duration_minutes || 60;
      const endMinutes = timeInfo.totalMinutes + duration;
      const endHours = Math.floor(endMinutes / 60) % 24;
      const endMins = endMinutes % 60;
      const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

      return {
        reservation: res,
        startMinutes: timeInfo.totalMinutes,
        durationMinutes: duration,
        endMinutes,
        timeStr: timeInfo.timeStr,
        endTimeStr,
      };
    });

    // Sort by start time ascending, then longer duration first
    parsed.sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) {
        return a.startMinutes - b.startMinutes;
      }
      return b.durationMinutes - a.durationMinutes;
    });

    // Assign each reservation to the first available lane
    const laneEndTimes: number[] = [];
    const items: PositionedReservation[] = [];

    for (const item of parsed) {
      let assignedLane = -1;
      for (let i = 0; i < laneEndTimes.length; i++) {
        if (laneEndTimes[i] <= item.startMinutes) {
          assignedLane = i;
          laneEndTimes[i] = item.endMinutes;
          break;
        }
      }

      if (assignedLane === -1) {
        assignedLane = laneEndTimes.length;
        laneEndTimes.push(item.endMinutes);
      }

      const leftPx = (item.startMinutes / 60) * HOUR_WIDTH;
      const widthPx = Math.max(120, (item.durationMinutes / 60) * HOUR_WIDTH - 6);
      const topPx = 16 + assignedLane * (CARD_HEIGHT + LANE_GAP);

      items.push({
        ...item,
        laneIndex: assignedLane,
        leftPx,
        widthPx,
        topPx,
      });
    }

    return { items, totalLanes: laneEndTimes.length };
  }, [reservations]);

  const canvasHeight = useMemo(() => {
    return Math.max(420, 32 + (positionedReservations.totalLanes || 1) * (CARD_HEIGHT + LANE_GAP));
  }, [positionedReservations.totalLanes]);

  // Auto scroll to first reservation or current hour on date change
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    let targetMinutes = 9 * 60; // Default 09:00 AM

    if (isToday) {
      const now = new Date();
      targetMinutes = Math.max(0, (now.getHours() - 1) * 60);
    } else if (reservations.length > 0) {
      const earliest = Math.min(
        ...reservations.map((r) => parseReservationTime(r.reserved_at).totalMinutes)
      );
      if (earliest < Infinity && earliest > 0) {
        targetMinutes = Math.max(0, earliest - 60);
      }
    }

    const scrollLeft = (targetMinutes / 60) * HOUR_WIDTH;
    scrollContainerRef.current.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior: 'smooth',
    });
  }, [selectedDate, isToday, reservations]);

  const getStatusColorClasses = (status: string) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-emerald-50/90 border-emerald-300 text-emerald-950 hover:bg-emerald-50';
      case 'Active':
        return 'bg-amber-50/90 border-amber-300 text-amber-950 hover:bg-amber-50';
      case 'Completed':
        return 'bg-blue-50/90 border-blue-300 text-blue-950 hover:bg-blue-50';
      case 'Cancelled':
        return 'bg-rose-50/70 border-rose-200 text-rose-800 opacity-65 hover:opacity-90';
      case 'No Show':
        return 'bg-orange-50/90 border-orange-300 text-orange-950 hover:bg-orange-50';
      case 'Requested':
      default:
        return 'bg-indigo-50/90 border-indigo-300 text-indigo-950 hover:bg-indigo-50';
    }
  };

  const getStatusHoverRingClass = (status: string) => {
    switch (status) {
      case 'Confirmed':
        return 'border-emerald-600 ring-2 ring-emerald-600/40';
      case 'Completed':
        return 'border-blue-600 ring-2 ring-blue-500/40';
      case 'Cancelled':
        return 'border-red-600 ring-2 ring-red-500/40';
      case 'No Show':
        return 'border-orange-600 ring-2 ring-orange-500/40';
      case 'Active':
        return 'border-amber-600 ring-2 ring-amber-500/40';
      case 'Requested':
      default:
        return 'border-indigo-600 ring-2 ring-indigo-500/40';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Confirmed':
        return <Badge variant="success">Confirmed</Badge>;
      case 'Active':
        return <Badge variant="warning">Active</Badge>;
      case 'Requested':
        return <Badge variant="outline">Requested</Badge>;
      case 'Completed':
        return <Badge variant="completed">Completed</Badge>;
      case 'Cancelled':
        return <Badge variant="cancelled">Cancelled</Badge>;
      case 'No Show':
        return <Badge variant="noshow">No Show</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80 text-gray-500 text-sm">
        Loading timeline view...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden select-none">
      {/* Scrollable Timeline Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto relative no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ width: `${TIMELINE_WIDTH}px` }} className="relative min-w-full">
          {/* Header: Horizontal Time Axis (No Table Column) */}
          <div className="sticky top-0 z-30 flex bg-gray-50 border-b border-gray-200">
            <div className="flex relative" style={{ width: `${TIMELINE_WIDTH}px` }}>
              {Array.from({ length: TOTAL_HOURS }).map((_, hour) => {
                const hourFormatted = `${String(hour).padStart(2, '0')}:00`;
                return (
                  <div
                    key={hour}
                    style={{ width: `${HOUR_WIDTH}px` }}
                    className="shrink-0 border-r border-gray-200 py-2.5 px-2 text-center relative"
                  >
                    <span className="text-xs font-semibold text-gray-700">{hourFormatted}</span>
                    {/* 30m sub-tick */}
                    <div className="absolute top-1/2 right-1/2 w-px h-2 bg-gray-300 transform -translate-y-1/2" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clean Canvas Area (No Table Rows or Box Outlines) */}
          <div
            className="relative bg-white"
            style={{ width: `${TIMELINE_WIDTH}px`, height: `${canvasHeight}px` }}
          >
            {/* Full-height vertical hour & half-hour grid lines */}
            <div className="absolute inset-0 flex pointer-events-none">
              {Array.from({ length: TOTAL_HOURS }).map((_, hour) => (
                <div
                  key={hour}
                  style={{ width: `${HOUR_WIDTH}px` }}
                  className="shrink-0 border-r border-gray-100 relative h-full"
                >
                  <div className="absolute top-0 bottom-0 right-1/2 border-r border-dashed border-gray-100/80" />
                </div>
              ))}
            </div>

            {/* Empty State when no reservations */}
            {positionedReservations.items.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="p-3 bg-gray-100/80 rounded-full text-gray-400 mb-2">
                  <BookLock className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-gray-700">No Reservations for this Date</p>
                <p className="text-xs text-gray-400 mt-0.5">Reservations will appear along the time axis.</p>
              </div>
            )}

            {/* Positioned Reservation Blocks */}
            {positionedReservations.items.map((item) => {
              const res = item.reservation;
              const isHovered = hoveredId === res.name;
              const resTable = res.reserved_table || (res as any).table || 'Table';

              return (
                <div
                  key={res.name}
                  onMouseEnter={() => setHoveredId(res.name)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelectReservation(res)}
                  style={{
                    left: `${item.leftPx}px`,
                    top: `${item.topPx}px`,
                    width: `${item.widthPx}px`,
                    height: `${CARD_HEIGHT}px`,
                    zIndex: isHovered ? 40 : 10,
                  }}
                  className={`absolute rounded-lg border p-2 flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-150 select-none ${
                    isHovered
                      ? `shadow-xl scale-[1.01] ${getStatusHoverRingClass(res.status)}`
                      : 'shadow-2xs hover:shadow-md'
                  } ${getStatusColorClasses(res.status)}`}
                >
                  {/* Top Row: Table Name badge + Time + Compact Status */}
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/90 shadow-2xs text-gray-900 border border-gray-200/60 shrink-0">
                      {resTable}
                    </span>

                    <span className="text-xs font-bold truncate flex items-center gap-1 text-gray-800">
                      <Clock className="w-3 h-3 shrink-0 opacity-60" />
                      {item.timeStr}
                    </span>

                    <div className="shrink-0 text-[10px] scale-90 origin-right">
                      {getStatusBadge(res.status)}
                    </div>
                  </div>

                  {/* Middle Row: Customer Name & Guest Count */}
                  <div className="text-[11px] font-medium text-gray-800 truncate flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3 shrink-0 opacity-60" />
                    <span className="truncate font-semibold">{res.customer_name || res.customer}</span>
                    {res.no_of_pax ? (
                      <span className="text-[10px] text-gray-500 shrink-0">
                        ({res.no_of_pax}p)
                      </span>
                    ) : null}
                  </div>

                  {/* Bottom Row: Phone / Time range */}
                  <div className="flex items-center justify-between text-[10px] text-gray-500 pt-0.5">
                    <span className="text-[10px] text-gray-600">
                      {item.timeStr} - {item.endTimeStr}
                    </span>
                    {res.customer_phone && (
                      <span className="flex items-center gap-0.5 opacity-70 truncate text-[10px]">
                        <Phone className="w-2.5 h-2.5 shrink-0" />
                        {res.customer_phone}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
