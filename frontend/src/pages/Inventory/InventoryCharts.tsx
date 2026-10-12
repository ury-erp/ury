import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatCompactCurrency, formatCurrency, getIntlLocale } from '@ury/core';
import type { MovementPoint } from '../../services/inventory';
import { OUT_COLOR, SERIES_COLOR } from './stockStatus';
import { t } from '../../i18n';

/**
 * The dashboard's two charts, drawn by hand so they read right-to-left as
 * well as left-to-right and match the page's own type and spacing.
 *
 * - BarList: magnitude across named things (warehouses, item groups). One
 *   series, so one color for every bar; sorted, labelled, with a hover share.
 * - MovementChart: value received (up) against value issued (down) per day
 *   or week — one axis, a diverging pair (blue/red) around a zero baseline.
 */

// ------------------------------------------------------------------ bar list

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export const BarList: React.FC<{
  data: BarDatum[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  empty: string;
}> = ({ data, selected, onSelect, empty }) => {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const max = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0 || total <= 0) {
    return <p className="py-10 text-center text-sm text-gray-400">{empty}</p>;
  }
  return (
    <ul className="space-y-2.5" role="list">
      {data.map((d) => {
        const share = total ? (d.value / total) * 100 : 0;
        const active = selected === d.key;
        const Tag = onSelect ? 'button' : 'div';
        return (
          <li key={d.key}>
            <Tag
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(d.key) } : {})}
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.key)}
              onBlur={() => setHover(null)}
              className={`group block w-full rounded-md px-1.5 py-1 text-start transition-colors ${
                onSelect ? 'cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none' : ''
              } ${active ? 'bg-primary/5' : ''}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className={`truncate ${active ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{d.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                  {hover === d.key ? `${share < 0.1 && share > 0 ? '<0.1' : share.toFixed(1)}%` : formatCompactCurrency(d.value)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full transition-[width] duration-500"
                  // A visible sliver for real-but-tiny values next to a giant.
                  style={{ width: `${d.value > 0 ? Math.max((d.value / max) * 100, 1.2) : 0}%`, background: SERIES_COLOR, opacity: hover && hover !== d.key ? 0.55 : 1 }}
                />
              </div>
              {d.hint && <p className="mt-0.5 text-[10px] text-gray-400">{d.hint}</p>}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
};

// ------------------------------------------------------------------ movement

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(entry.contentRect.width, 240)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const HEIGHT = 220;
const PAD = { top: 14, bottom: 26, left: 8, right: 56 };

export const MovementChart: React.FC<{
  points: MovementPoint[];
  granularity: 'day' | 'week';
  /** Offered when the period is empty: look further back instead of at a blank chart. */
  onWiden?: () => void;
}> = ({ points, granularity, onWiden }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const locale = getIntlLocale();

  const maxIn = Math.max(...points.map((p) => p.in_value), 0);
  const maxOut = Math.max(...points.map((p) => p.out_value), 0);
  const hasData = maxIn > 0 || maxOut > 0;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  // The baseline sits where the two magnitudes say it should, on one scale.
  const scaleMax = Math.max(maxIn + maxOut, 1);
  const zeroY = PAD.top + (maxIn / scaleMax) * plotH;
  const step = plotW / Math.max(points.length, 1);
  const barW = Math.max(Math.min(step - 2, 22), 1.5);
  const y = (v: number) => (v / scaleMax) * plotH;

  const fmtDate = useMemo(
    () => (iso: string) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      return new Date(yy, mm - 1, dd).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    },
    [locale],
  );

  const ticks = useMemo(() => {
    const n = Math.min(6, points.length);
    if (n <= 1) return points.map((_, i) => i);
    return Array.from({ length: n }, (_, k) => Math.round((k * (points.length - 1)) / (n - 1)));
  }, [points]);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <p className="text-sm text-gray-400">{t('dash.inventory.no_movement')}</p>
        {onWiden && (
          <button type="button" onClick={onWiden} className="text-xs font-semibold text-primary hover:underline">
            {t('dash.inventory.show_last_year')}
          </button>
        )}
      </div>
    );
  }

  const roundedTop = (x: number, top: number, h: number, w: number) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
  };
  const roundedBottom = (x: number, top: number, h: number, w: number) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + w - r} Q${x + w},${top + h} ${x + w},${top + h - r} V${top} Z`;
  };

  const hp = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(PAD.left + hover * step + step / 2, 90), width - 90) : 0;

  return (
    <div>
      {/* Legend: two series, so a legend, and both are direct-named in the tooltip. */}
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLOR }} /> {t('dash.inventory.received')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT_COLOR }} /> {t('dash.inventory.issued')}
        </span>
        <span className="text-gray-400">
          {granularity === 'week' ? t('dash.inventory.per_week') : t('dash.inventory.per_day')}
        </span>
      </div>
      <div ref={ref} className="relative" dir="ltr" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={t('dash.inventory.movement_title')}>
          {/* Axis labels: the two extremes, on the end side */}
          <text x={width - PAD.right + 6} y={PAD.top + 4} fontSize="10" fill="#898781">{formatCompactCurrency(maxIn)}</text>
          <text x={width - PAD.right + 6} y={zeroY + 3} fontSize="10" fill="#898781">0</text>
          <text x={width - PAD.right + 6} y={PAD.top + plotH} fontSize="10" fill="#898781">{formatCompactCurrency(maxOut)}</text>

          {points.map((p, i) => {
            const x = PAD.left + i * step + (step - barW) / 2;
            const hin = y(p.in_value);
            const hout = y(p.out_value);
            const dim = hover !== null && hover !== i ? 0.45 : 1;
            return (
              <g key={p.date} opacity={dim}>
                {hin > 0 && <path d={roundedTop(x, zeroY - hin - 1, hin, barW)} fill={SERIES_COLOR} />}
                {hout > 0 && <path d={roundedBottom(x, zeroY + 1, hout, barW)} fill={OUT_COLOR} />}
              </g>
            );
          })}

          {/* Baseline */}
          <line x1={PAD.left} x2={width - PAD.right} y1={zeroY} y2={zeroY} stroke="#c3c2b7" strokeWidth={1} />

          {/* Crosshair */}
          {hover !== null && (
            <line
              x1={PAD.left + hover * step + step / 2}
              x2={PAD.left + hover * step + step / 2}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="#898781"
              strokeWidth={1}
            />
          )}

          {ticks.map((i) => (
            <text key={i} x={PAD.left + i * step + step / 2} y={HEIGHT - 6} fontSize="10" fill="#898781" textAnchor="middle">
              {fmtDate(points[i].date)}
            </text>
          ))}

          {/* Hit targets: full-height columns, wider than the bars */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.date}`}
              x={PAD.left + i * step}
              y={PAD.top}
              width={step}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>

        {hp && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: tipLeft }}
            dir="auto"
          >
            <p className="mb-1 font-bold text-gray-900">
              {granularity === 'week' ? t('dash.inventory.week_of', { date: fmtDate(hp.date) }) : fmtDate(hp.date)}
            </p>
            <div className="flex justify-between gap-3">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_COLOR }} /> {t('dash.inventory.received')}
              </span>
              <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(hp.in_value)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <span className="h-2 w-2 rounded-sm" style={{ background: OUT_COLOR }} /> {t('dash.inventory.issued')}
              </span>
              <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(hp.out_value)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t border-gray-100 pt-1">
              <span className="text-gray-600">{t('dash.inventory.net')}</span>
              <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(hp.in_value - hp.out_value)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
