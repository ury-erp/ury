import { Minus, Plus, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { cn, Badge } from '@ury/ui';
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

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-3 px-3 rounded-lg',
        variant === 'delta' && 'bg-primary-tint',
        variant === 'reduction' && 'bg-destructive-tint',
        variant === 'confirmed' && 'bg-card'
      )}
    >
      <button
        type="button"
        onClick={onEditNote}
        disabled={!onEditNote}
        className={cn('flex-1 text-start', !onEditNote && 'cursor-default')}
      >
        <div className="space-y-2">
          {/* Item name row with status badge */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium',
                variant === 'reduction' && 'line-through decoration-red-400',
                variant === 'delta' && 'text-primary',
                variant === 'reduction' && 'text-destructive',
                variant === 'confirmed' && 'text-foreground'
              )}
            >
              {line.name}
            </span>

            {variant === 'delta' && (
              <Badge variant="tagAccent" size="sm">
                New
              </Badge>
            )}
            {variant === 'reduction' && (
              <Badge variant="tagDestructive" size="sm">
                Removing
              </Badge>
            )}
          </div>

          {/* Quantity × Price = Total */}
          <p className="text-xs text-text-tertiary">
            {displayQty} × {formatCurrency(line.price)} = {formatCurrency(line.price * displayQty)}
          </p>

          {/* Comment if present */}
          {line.comment && (
            <p className="text-xs text-text-tertiary flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {line.comment}
            </p>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {variant === 'delta' && (onDecrement || onIncrement) && (
          <>
            <button
              type="button"
              onClick={onDecrement}
              disabled={disabled}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-muted"
              aria-label="Decrease"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onIncrement}
              disabled={disabled}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-muted"
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
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-muted"
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
            className="w-9 h-9 rounded-full border border-destructive text-destructive flex items-center justify-center disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-destructive/10"
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
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-muted"
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
