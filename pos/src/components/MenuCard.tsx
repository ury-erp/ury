import { FC } from 'react';
import { formatCurrency, cn } from '../lib/utils';

interface MenuCardProps {
  id: string;
  name: string;
  price: number;
  item_image: string | null;
  course?: string;
  item: string;
  item_code?: string;
  showItemCode?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

const MenuCard: FC<MenuCardProps> = ({
  id,
  name,
  price,
  item_image,
  course,
  item,
  item_code,
  showItemCode,
  onClick,
  disabled
}) => {
  // Image placeholder: prefer the item code; long codes shrink instead of
  // overflowing the fixed-height image area.
  const placeholderText = item_code || item || name.slice(0, 2).toUpperCase();
  const placeholderSize =
    placeholderText.length <= 6
      ? 'text-xl'
      : placeholderText.length <= 14
        ? 'text-sm'
        : 'text-[10px]';
  const placeholderClass = `w-full h-full bg-[#0000A0] flex items-center justify-center text-white font-bold font-mono px-1 text-center break-all overflow-hidden ${placeholderSize}`;

  return (
    <div
      className={cn(
        // a denser grid needs a harder card edge: border + real shadow, else the
        // cards blur into one sheet at this size
        "bg-white rounded-md border border-gray-200 shadow-md shadow-cyan-900/25 hover:shadow-lg hover:shadow-cyan-900/25 hover:border-primary-300 overflow-hidden transition-shadow cursor-pointer h-[8.5rem] flex flex-col",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
      onClick={disabled ? undefined : onClick}
      title={course ? `${name} — ${course}` : name}
    >
      {/* Image section - fixed height */}
      <div className="h-14">
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
                placeholder.className = placeholderClass;
                placeholder.textContent = placeholderText;
                parent.insertBefore(placeholder, target);
              }
            }}
          />
        ) : (
          <div className={placeholderClass}>
            {placeholderText}
          </div>
        )}
      </div>

      {/* Content section.
          The card is deliberately dense: the cashier has to see as many items
          as possible in one screen, so the course line was dropped (the course
          rail already says which course is on screen) and the name/price sit on
          the smallest readable type. */}
      <div className="flex-1 px-2 py-1.5 flex flex-col min-h-0">
        {/* Name / item code section.
            When the POS Profile enables item code, the code stays the primary
            (mono, on top) label and the name follows in blue underneath.
            Otherwise the blue name is the only label. */}
        {showItemCode && (item_code || item) ? (
          <>
            {/* The code is what the staff actually reads to punch an order, so
                it stays the loudest line on the card: bold, dark, a step larger
                than the name and price under it. */}
            <p className="font-bold text-gray-900 text-[13px] leading-[1.05rem] font-mono truncate" title={item_code || item}>
              {item_code || item}
            </p>
            <h3 className="text-[10px] text-primary-600 font-medium leading-[0.85rem] line-clamp-2" title={name}>
              {name}
            </h3>
          </>
        ) : (
          <h3 className="text-xs text-primary-600 font-medium leading-4 line-clamp-3" title={name}>
            {name}
          </h3>
        )}

        {/* Price section - pushed to bottom */}
        <span className="mt-auto pt-1 text-[11px] font-semibold text-gray-900 tabular-nums">
          {formatCurrency(price)}
        </span>
      </div>
    </div>
  );
};

export default MenuCard;
