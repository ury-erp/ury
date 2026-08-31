import { Minus, Plus, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import type { OrderDeltaLine } from '../hooks/useTableOrderContext';

interface CaptainOrderLineProps {
  line: OrderDeltaLine;
  /** 'confirmed' = Already Ordered row, 'delta' = New/Changed row, 'reduction' = Reduction pending row. */
  variant: 'confirmed' | 'delta' | 'reduction';
  disabled?: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
  onEditNote?: () => void;
}

/**
 * Single row in the delta-aware order list (PLAN.md §8). Deliberately one
 * component for all three groups (rather than three near-duplicates) since
 * they share the same line shape and differ only in which controls show.
 */
const CaptainOrderLine: React.FC<CaptainOrderLineProps> = ({
  line,
  variant,
  disabled,
  onIncrement,
  onDecrement,
  onRemove,
  onRestore,
  onEditNote,
}) => {
  const displayQty = variant === 'confirmed' ? line.confirmedQty : variant === 'reduction' ? Math.abs(line.delta) : line.delta;
  const sign = variant === 'delta' ? '+' : variant === 'reduction' ? '−' : '';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-3 px-3 rounded-lg',
        variant === 'delta' && 'bg-blue-50',
        variant === 'reduction' && 'bg-red-50',
        variant === 'confirmed' && 'bg-white'
      )}
    >
      <button
        type="button"
        onClick={onEditNote}
        disabled={!onEditNote}
        className={cn('flex-1 text-start', !onEditNote && 'cursor-default')}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'font-medium text-sm',
              variant === 'delta' && 'text-blue-900',
              variant === 'reduction' && 'text-red-900 line-through decoration-red-400',
              variant === 'confirmed' && 'text-gray-900'
            )}
          >
            {sign}
            {displayQty} &times; {line.name}
          </span>
        </div>
        {line.comment && (
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {line.comment}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(line.price * displayQty)}</p>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {variant === 'delta' && (onDecrement || onIncrement) && (
          <>
            <button
              type="button"
              onClick={onDecrement}
              disabled={disabled}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
              aria-label="Decrease"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onIncrement}
              disabled={disabled}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
              aria-label="Increase"
            >
              <Plus className="w-4 h-4" />
            </button>
          </>
        )}

        {variant === 'confirmed' && onDecrement && (
          <button
            type="button"
            onClick={onDecrement}
            disabled={disabled}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
            aria-label="Reduce quantity"
            title="Reduce quantity"
          >
            <Minus className="w-4 h-4" />
          </button>
        )}

        {variant === 'confirmed' && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="w-9 h-9 rounded-full border border-red-200 text-red-600 flex items-center justify-center disabled:opacity-40"
            aria-label="Remove item"
            title="Remove item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {variant === 'reduction' && onRestore && (
          <button
            type="button"
            onClick={onRestore}
            disabled={disabled}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
            aria-label="Undo reduction"
            title="Undo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CaptainOrderLine;
