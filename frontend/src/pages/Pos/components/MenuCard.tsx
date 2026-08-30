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
  item_image,
  course,
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

  return (
    <div
      className={cn(
        "bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-56 flex flex-col",
        isDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
      onClick={isDisabled ? undefined : onClick}
      aria-disabled={isDisabled || undefined}
    >
      {/* Image section - fixed height */}
      <div className="h-24 relative">
        {item_image ? (
          <img
            src={item_image}
            alt={name}
            className="w-full h-full object-cover filter saturate-75 brightness-95"
            style={{ filter: 'saturate(0.7) brightness(0.95)' }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                const placeholder = document.createElement('div');
                placeholder.className = 'w-full h-full bg-muted flex items-center justify-center text-2xl text-text-tertiary font-medium';
                placeholder.textContent = name.slice(0, 2).toUpperCase();
                parent.insertBefore(placeholder, target);
              }
            }}
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-2xl text-text-tertiary font-medium">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {unavailableMessage && (
          <span className="absolute top-1 right-1 bg-gray-900/80 text-white text-[10px] font-medium px-2 py-0.5 rounded">
            {unavailableMessage}
          </span>
        )}
      </div>

      {/* Content section - flex grow with fixed padding */}
      <div className="flex-1 p-3 flex flex-col">
        {/* Name section - fixed height for 2 lines */}
        <div className="">
          <h3 className="font-medium text-foreground text-sm leading-5 line-clamp-2" title={name}>
            {name}
          </h3>
        </div>

        {/* Course section - fixed height for 1 line */}
        <div className="h-5 mt-1">
          <p className="text-xs text-text-tertiary truncate" title={course}>
            {course || ' '}
          </p>
        </div>

        {/* Price section - pushed to bottom */}
        <div className="mt-auto pt-2">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatCurrency(price)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MenuCard;
