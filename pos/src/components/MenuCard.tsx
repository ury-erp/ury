import React, { FC, useState } from 'react';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';

interface MenuCardProps {
  id: string;
  name: string;
  price: number;
  item_image: string | null;
  course?: string;
  item: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Position in the grid, used only to stagger the entrance animation. */
  index?: number;
}

/**
 * A single menu item in the POS grid.
 *
 * Rendered as a real <button>: this is the most-tapped control in the app and
 * was previously a <div onClick>, which meant no keyboard access, no focus
 * ring and nothing announced to assistive tech.
 *
 * The image fallback is React state rather than the imperative
 * `document.createElement` + `insertBefore` it used to do on every error —
 * that inserted a fresh node each time the handler fired and fought the
 * reconciler for ownership of the subtree.
 */
const MenuCard: FC<MenuCardProps> = ({
  name,
  price,
  item_image,
  course,
  onClick,
  disabled,
  index = 0,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item_image && !imageFailed;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={name}
      /* The stagger index is capped inside the `.stagger` utility, so a
         200-item menu still finishes arriving in ~320ms. */
      style={{ '--i': index } as React.CSSProperties}
      className={cn(
        'group flex h-60 flex-col overflow-hidden rounded-2xl border border-border bg-card text-start',
        'animate-fade-in-up stagger-fast',
        'shadow-sm transition-[transform,box-shadow,border-color] duration-fast ease-out',
        'hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-lg',
        'active:translate-y-0 active:scale-[0.99] active:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
        'select-none touch-manipulation',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      {/* Image. Fixed height so a grid of mixed-aspect photos stays on a
          single baseline instead of every row being a different height. */}
      <div className="h-28 shrink-0 overflow-hidden bg-secondary">
        {showImage ? (
          <img
            src={item_image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            /* Slightly desaturated at rest so the photos sit behind the text
               rather than competing with it, and full colour on hover. */
            className={cn(
              'h-full w-full object-cover',
              'saturate-[0.85] brightness-[0.97]',
              'transition-[transform,filter] duration-base ease-out',
              'group-hover:scale-[1.04] group-hover:saturate-100 group-hover:brightness-100',
            )}
          />
        ) : (
          /* Initials placeholder — covers both "no image set" and "image
             failed to load", which a POS on a slow connection hits often. */
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-accent-100 text-2xl font-bold text-primary"
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {name}
        </h3>

        {/* Reserved line so cards with and without a course still align. */}
        <p className="mt-1 h-5 truncate text-xs text-muted-foreground">
          {course || ' '}
        </p>

        <div className="mt-auto pt-2">
          <span className="text-base font-bold text-primary tabular-nums">
            {formatCurrency(price)}
          </span>
        </div>
      </div>
    </button>
  );
};

export default MenuCard;
