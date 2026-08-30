import { FC, useEffect, useState } from 'react';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import {
  getAvailabilityMessage,
  getItemAvailability,
  ItemAvailability,
} from '../lib/availability-api';

interface MenuCardProps {
  id: string;
  name: string;
  price: number;
  item_image: string | null;
  course?: string;
  item: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Branch/company for the V3-44 availability lookup; omit to skip the check entirely. */
  branch?: string;
  company?: string;
}

const MenuCard: FC<MenuCardProps> = ({
  name,
  price,
  item_image: _itemImage,
  course: _course,
  item,
  onClick,
  disabled,
  branch,
  company,
}) => {
  const [availability, setAvailability] = useState<ItemAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!branch || !company || !item) {
      setAvailability(null);
      return;
    }
    getItemAvailability({ item_code: item, branch, company })
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch(() => {
        // Display-only lookup — a failed check must never block the menu
        // from rendering. Treat as "unknown" (no gating) on error.
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item, branch, company]);

  const isUnavailable = !!availability && (!availability.sellable || availability.available_qty <= 0);
  const isDisabled = disabled || isUnavailable;
  const unavailableMessage = isUnavailable ? getAvailabilityMessage(availability?.reason_code) : null;

  // Determine tag class and text for availability status
  const getAvailabilityTag = (): { tagClass: string; text: string; showDot: boolean } | null => {
    if (!availability) return null;

    if (!availability.sellable || availability.available_qty <= 0) {
      return { tagClass: 'bg-destructive-tint text-destructive', text: unavailableMessage || 'Unavailable', showDot: false };
    }

    if (availability.available_qty < 5) {
      return { tagClass: 'bg-warning-tint text-warning', text: `${availability.available_qty} left`, showDot: false };
    }

    return { tagClass: 'bg-success-tint text-success', text: `${availability.available_qty} left`, showDot: true };
  };

  const availabilityTag = getAvailabilityTag();

  return (
    <button
      type="button"
      className={cn(
        "border border-hair rounded-[9px] bg-card p-3 text-left cursor-pointer relative transition-all",
        "hover:border-hair2 hover:shadow-sm",
        isDisabled && "opacity-45 cursor-not-allowed"
      )}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
    >
      {/* Name */}
      <div className="text-[12.5px] font-[550] leading-[1.3] text-foreground mb-1">
        {name}
      </div>

      {/* Price */}
      <div className="font-mono text-xs text-muted-foreground mt-[5px] tabular-nums">
        {formatCurrency(price)}
      </div>

      {/* Status/Availability tag */}
      {availabilityTag && (
        <div className="mt-2">
          <span className={cn(
            "inline-flex items-center gap-[5px] text-[11px] h-[19px] px-[7px] rounded-[5px]",
            availabilityTag.tagClass
          )}>
            {availabilityTag.showDot && (
              <span className="w-[5px] h-[5px] rounded-full bg-current flex-none"></span>
            )}
            {availabilityTag.text}
          </span>
        </div>
      )}
    </button>
  );
};

export default MenuCard;
