import * as React from 'react'
import { cn } from '../lib/cn'

// shrink-0 is required on the actions group: flex-1 alone still leaves
// flex-shrink: 1, so a fixed-width date control compresses without it.

export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Filters and actions. Rendered in a group that never shrinks. */
  actions?: React.ReactNode
  /** Extra content under the description (e.g. a warning line). */
  children?: React.ReactNode
  /** Full-bleed variant: the -mx/-mt bleed + bottom border that
   *  SalesPlanPage and RequirementsPage hand-roll today. */
  bleed?: boolean
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  bleed = false,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        bleed && '-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-full lg:basis-auto">
          {typeof title === 'string' ? (
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          ) : (
            title
          )}
          {description != null &&
            (typeof description === 'string' ? (
              <p className="mt-1 text-sm text-text-tertiary">{description}</p>
            ) : (
              description
            ))}
          {children}
        </div>
        {actions != null && (
          <div className="flex flex-1 shrink-0 flex-wrap items-center justify-end gap-3 basis-full lg:basis-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
