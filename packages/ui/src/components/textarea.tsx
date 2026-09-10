import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const textareaVariants = cva(
  [
    "flex w-full rounded-md border border-input bg-background text-sm shadow-sm",
    "leading-relaxed resize-y touch-manipulation",
    "placeholder:text-muted-foreground",
    "transition-[border-color,box-shadow] duration-150 ease-out",
    // Identical focus treatment to Input/Select — this used `ring-primary`
    // where the other two used `ring-ring` and `ring-primary-100`.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100 disabled:shadow-none disabled:resize-none",
  ],
  {
    variants: {
      variant: {
        default: "border-gray-200 hover:border-gray-300 focus-visible:border-primary",
        error:
          "border-red-300 hover:border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500",
        success:
          "border-green-300 hover:border-green-400 focus-visible:border-green-500 focus-visible:ring-green-500",
      },
      // Sizes now carry padding as well as height, so a Textarea's text gutter
      // lines up with the Input of the same size instead of always being px-3.
      size: {
        default: "min-h-[88px] px-3.5 py-2.5 text-sm",
        sm: "min-h-[64px] px-3 py-2 text-xs",
        lg: "min-h-[132px] px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  /** @deprecated Use `variant="error"` instead. */
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, size, error, ...props }, ref) => {
    const textareaVariant = error ? "error" : variant;
    return (
      <textarea
        className={cn(textareaVariants({ variant: textareaVariant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };
