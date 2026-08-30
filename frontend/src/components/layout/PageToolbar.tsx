import React from 'react';
import { cn } from '@ury/ui';

interface PageToolbarProps {
  /** Toolbar content — left/right group divs, or buttons directly, per page's own layout. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Full-bleed page toolbar that punches through `DashboardLayout`'s `p-6` gutter so the
 * toolbar's border touches the edges of the layout container, while its content stays
 * aligned with the page body below.
 *
 * Only the shared wrapper (bleed + border + base flex layout) lives here — each page passes
 * its own alignment/gap via `className` (merged via `cn`, so conflicting utilities like
 * `justify-end` vs `justify-between` resolve to the page's override) and its own toolbar
 * content as `children`.
 */
export function PageToolbar({ children, className }: PageToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6',
        className
      )}
    >
      {children}
    </div>
  );
}
