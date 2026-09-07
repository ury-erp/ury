import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export const sidebarItemVariants = cva(
  [
    "w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium",
    "transition-all duration-200 group relative rounded-md text-start",
    "select-none touch-manipulation",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      active: {
        true: "bg-white text-gray-900 shadow-sm font-semibold hover:bg-accent hover:text-accent-foreground",
        false: "text-gray-700 hover:bg-white/60 hover:text-gray-900",
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
        "w-64 bg-white border-e border-gray-200 h-full flex flex-col shrink-0 font-inter",
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
      className={cn("bg-gray-50 border border-gray-200 rounded-lg p-4", className)}
      {...props}
    >
      {children}
    </div>
  )
);
SidebarCard.displayName = "SidebarCard";

export const SidebarActiveIndicator = () => (
  <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-e-full" />
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
