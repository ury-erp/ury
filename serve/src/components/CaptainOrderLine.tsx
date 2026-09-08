import { useEffect, useState, type FC } from 'react';
import { Minus, Plus, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import type { OrderDeltaLine } from '../hooks/useTableOrderContext';

interface CaptainOrderLineProps {
  line: OrderDeltaLine;
  /** 'confirmed' = Already Ordered row, 'delta' = New/Changed row, 'reduction' = Reduction pending row. */
  variant: 'confirmed' | 'delta' | 'reduction';
  disabled?: boolean;
  /** Menu thumbnail URL; missing/failed images fall back to name initials. */
  imageUrl?: string | null;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
  /**
   * Show the remove control disabled (permission missing). Does not bypass
   * `remove_items` — the control stays non-interactive.
   */
  removeBlocked?: boolean;
  onRestore?: () => void;
  onEditNote?: () => void;
}

/**
 * Single row in the delta-aware order list (PLAN.md §8). Deliberately one
 * component for all three groups (rather than three near-duplicates) since
 * they share the same line shape and differ only in which controls show.
 */
const CaptainOrderLine: FC<CaptainOrderLineProps> = ({
  line,
  variant,
  disabled,
  imageUrl,
  onIncrement,
  onDecrement,
  onRemove,
  removeBlocked,
  onRestore,
  onEditNote,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;
  const displayQty = variant === 'confirmed' ? line.confirmedQty : variant === 'reduction' ? Math.abs(line.delta) : line.delta;
  const sign = variant === 'delta' ? '+' : variant === 'reduction' ? '−' : '';
  const showRemove = Boolean(onRemove) || Boolean(removeBlocked);
  const removeDisabled = Boolean(disabled) || Boolean(removeBlocked) || !onRemove;
  const removeTitle = removeBlocked
    ? 'Removing a sent item is not permitted for this profile'
    : 'Remove item';

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 py-2.5 px-2.5 rounded-lg sm:gap-3 sm:px-3',
        variant === 'delta' && 'bg-blue-50',
        variant === 'reduction' && 'bg-red-50',
        variant === 'confirmed' && 'bg-white'
      )}
    >
      <div
        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md"
        aria-hidden
      >
        {showImage ? (
          <img
            src={imageUrl!}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: 'saturate(0.7) brightness(0.95)' }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-200 text-xs font-medium text-gray-400">
            {line.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onEditNote}
        disabled={!onEditNote}
        className={cn('min-w-0 flex-1 text-start', !onEditNote && 'cursor-default')}
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
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span className="truncate">{line.comment}</span>
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

        {variant === 'confirmed' && onIncrement && (
          <button
            type="button"
            onClick={onIncrement}
            disabled={disabled}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40"
            aria-label="Increase"
            title="Increase quantity"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}

        {variant === 'confirmed' && showRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removeDisabled}
            className="w-9 h-9 rounded-full border border-red-200 text-red-600 flex items-center justify-center disabled:opacity-40"
            aria-label={removeBlocked ? 'Remove item (not permitted)' : 'Remove item'}
            title={removeTitle}
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
