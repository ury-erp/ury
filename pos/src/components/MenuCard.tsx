import React, { FC, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { t } from '../i18n';

interface MenuCardProps {
  id: string;
  name: string;
  price: number;
  item_image: string | null;
  course?: string;
  item: string;
  onClick?: () => void;
  /** Opens the item's detail/options panel. Rendered as its own control so
      customising never depends on a double click. */
  onCustomize?: () => void;
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
 *
 * Adding and customising are two sibling buttons, not one button with a
 * click-count timer. The timer version shared its counter across every card,
 * so tapping two different items inside the double-click window opened the
 * second item's options and added neither (UX-01). It also left customising
 * undiscoverable and unreachable by keyboard.
 */
const MenuCard: FC<MenuCardProps> = ({
  name,
  price,
  item_image,
  course,
  onClick,
  onCustomize,
  disabled,
  index = 0,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = item_image && !imageFailed;

  return (
    <div
      className="group relative animate-fade-in-up stagger-fast"
      /* The stagger index is capped inside the `.stagger` utility, so a
         200-item menu still finishes arriving in ~320ms. */
      style={{ '--i': index } as React.CSSProperties}
    >
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={name}
      aria-label={t('menu.add_item', { item: name })}
      className={cn(
        'flex h-60 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-start',
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

      {onCustomize && (
        <button
          type="button"
          disabled={disabled}
          onClick={onCustomize}
          aria-label={t('menu.customize_item', { item: name })}
          title={t('menu.customize')}
          className={cn(
            'absolute end-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full',
            'border border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur-sm',
            'transition-[color,background-color,transform] duration-fast ease-out',
            'hover:bg-card hover:text-primary active:scale-90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default MenuCard;
