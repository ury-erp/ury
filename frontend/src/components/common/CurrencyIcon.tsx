import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { getCurrencySymbol } from '@ury/core';

/** Supports every configured Currency, including symbols absent from Lucide. */
export const CurrencyIcon = forwardRef<SVGSVGElement, LucideProps>(function CurrencyIcon(
  { size = 24, color = 'currentColor', ...props }, ref,
) {
  const symbol = getCurrencySymbol() || '¤';
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <text x="12" y="17" textAnchor="middle" fontSize={symbol.length > 2 ? 10 : 20} fontFamily="sans-serif">
        {symbol}
      </text>
    </svg>
  );
});
