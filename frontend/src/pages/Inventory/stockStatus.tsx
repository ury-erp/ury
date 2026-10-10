import React from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, MinusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StockStatus } from '../../services/inventory';
import { t } from '../../i18n';

/**
 * Stock health, the one place its colors live.
 *
 * These are status colors (good / warning / critical) and mean only that;
 * no chart series reuses them. Because the amber is light by design, a status
 * is never shown by color alone — every use pairs it with its icon and label.
 */

export const STATUS_COLOR: Record<StockStatus, string> = {
  ok: '#0ca30c',
  low: '#fab219',
  out: '#d03b3b',
  negative: '#d03b3b',
};

/** Neutral goods colors for the 3D scene: healthy stock is cardboard, not green. */
export const GOODS_COLOR = '#c9a27c';
export const STAGNANT_COLOR = '#a8a29e';

/** Single-series and in/out colors for the charts (validated: CVD ΔE 21.6, contrast ≥ 3:1). */
export const SERIES_COLOR = '#2a78d6';
export const OUT_COLOR = '#e34948';

const ICON: Record<StockStatus, LucideIcon> = {
  ok: CheckCircle2,
  low: AlertTriangle,
  out: CircleSlash,
  negative: MinusCircle,
};

export const statusLabel = (status: StockStatus) => t(`dash.inventory.status_${status}`);

const BADGE_CLASS: Record<StockStatus, string> = {
  ok: 'bg-green-50 text-green-800 border-green-200',
  low: 'bg-amber-50 text-amber-900 border-amber-200',
  out: 'bg-red-50 text-red-800 border-red-200',
  negative: 'bg-red-100 text-red-900 border-red-300',
};

export const StatusBadge: React.FC<{ status: StockStatus; className?: string }> = ({ status, className }) => {
  const Icon = ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${BADGE_CLASS[status]} ${className || ''}`}
    >
      <Icon className="h-3 w-3" style={{ color: STATUS_COLOR[status] }} aria-hidden />
      {statusLabel(status)}
    </span>
  );
};

export const StatusIcon: React.FC<{ status: StockStatus; className?: string }> = ({ status, className }) => {
  const Icon = ICON[status];
  return <Icon className={className || 'h-3.5 w-3.5'} style={{ color: STATUS_COLOR[status] }} aria-hidden />;
};

/** A warehouse's worst condition, for its roof in the 3D map. */
export function warehouseHealth(w: { negative_count: number; out_count: number; low_count: number; item_count: number }):
  | StockStatus
  | 'empty' {
  if (w.negative_count > 0) return 'negative';
  if (w.item_count === 0 && w.out_count === 0) return 'empty';
  if (w.out_count > 0) return 'out';
  if (w.low_count > 0) return 'low';
  return 'ok';
}

export const EMPTY_COLOR = '#c3c2b7';

export const healthColor = (h: StockStatus | 'empty') => (h === 'empty' ? EMPTY_COLOR : STATUS_COLOR[h]);
export const healthLabel = (h: StockStatus | 'empty') =>
  h === 'empty' ? t('dash.inventory.health_empty') : t(`dash.inventory.health_${h}`);

/** "Stores - SC" -> "Stores": the company suffix is noise on a single-company map. */
export const shortName = (label: string) => label.replace(/\s-\s[^-]+$/, '');

export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? qty.toLocaleString('en-US') : qty.toLocaleString('en-US', { maximumFractionDigits: 3 });
}
