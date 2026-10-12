import React from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash } from 'lucide-react';
import { foodCostBand } from '../../services/recipes';
import { STATUS_COLOR } from '../Inventory/stockStatus';
import { t } from '../../i18n';

/**
 * Food cost % of the selling price, with its band (≤35% good, ≤45% watch,
 * above that high). Status colors from the shared palette, always beside an
 * icon and a word.
 */

const BAND = {
  good: { icon: CheckCircle2, color: STATUS_COLOR.ok, cls: 'bg-green-50 text-green-800 border-green-200' },
  watch: { icon: AlertTriangle, color: STATUS_COLOR.low, cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  high: { icon: CircleSlash, color: STATUS_COLOR.out, cls: 'bg-red-50 text-red-800 border-red-200' },
} as const;

export const FoodCostBadge: React.FC<{ percent: number | null; large?: boolean }> = ({ percent, large }) => {
  const band = foodCostBand(percent);
  if (!band || percent === null) return <span className="text-xs text-gray-300">—</span>;
  const { icon: Icon, color, cls } = BAND[band];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold ${cls} ${
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      <Icon className={large ? 'h-4 w-4' : 'h-3 w-3'} style={{ color }} aria-hidden />
      <span className="tabular-nums">{percent.toFixed(1)}%</span>
      <span className="font-normal">· {t(`dash.recipes.band_${band}`)}</span>
    </span>
  );
};
