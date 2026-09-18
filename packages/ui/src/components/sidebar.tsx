import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export const sidebarItemVariants = cva(
  [
    "w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium",
    "transition-[background-color,color,box-shadow] duration-fast ease-out group relative rounded-lg text-start",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
    "select-none touch-manipulation",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      active: {
        true: "bg-primary-50 text-primary-800 shadow-sm font-semibold hover:bg-primary-100 hover:text-primary-900",
        false: "text-gray-700 hover:bg-white/80 hover:text-gray-900",
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

export interface SidebarContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
}

export const SidebarContainer = React.forwardRef<HTMLDivElement, SidebarContainerProps>(
  ({ className, disabled, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "w-64 bg-[#fffdf8] border-e border-[#eadfce] h-full flex flex-col shrink-0",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarContainer.displayName = "SidebarContainer";

export const SidebarCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("bg-[#fffaf0] border border-[#eadfce] rounded-xl p-4", className)}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarCard.displayName = "SidebarCard";

/**
 * The bar marking the active nav item.
 *
 * Positioned on the logical start edge so it stays on the reading-start side
 * in Arabic. It grows from the centre on mount, which gives the eye something
 * to follow when the selection moves between items — the alternative is the
 * marker teleporting, which is the main reason nav changes feel abrupt.
 */
export const SidebarActiveIndicator = () => (
  <span
    aria-hidden="true"
    className={cn(
      "absolute start-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-e-full bg-primary",
      "origin-center animate-[scale-in_var(--duration-base)_var(--ease-out)_both]"
    )}
  />
);

export interface SidebarItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof sidebarItemVariants> {
  isActive?: boolean;
}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, isActive, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(sidebarItemVariants({ active: isActive }), className)}
      {...props}
    >
      {isActive && <SidebarActiveIndicator />}
      {children}
    </button>
  )
);
SidebarItem.displayName = "SidebarItem";
