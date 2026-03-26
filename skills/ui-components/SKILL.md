---
category: ui
name: ui-components
description: React UI component system with CVA variants (@ury/ui package)
version: 1.0.0
---

# UI Components Skill

React UI component library for URY applications using CVA (Class Variance Authority) for type-safe styling variants.

## Quick Start

```tsx
import { Button } from '@ury/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@ury/ui';

function MyComponent() {
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Order Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <Button variant="primary" size="lg">
          Place Order
        </Button>
      </CardContent>
    </Card>
  );
}
```

## Component API Reference

### Button

Main action component with multiple variants and sizes.

```tsx
import { Button, buttonVariants } from '@ury/ui';

// Basic usage
<Button>Click me</Button>

// With variants
<Button variant="destructive" size="sm">Delete</Button>
<Button variant="success" size="lg">Confirm</Button>
<Button variant="tab" data-selected={true}>Tab</Button>

// Using variant classes directly (for non-button elements)
<div className={buttonVariants({ variant: 'outline', size: 'sm' })}>
  Custom element
</div>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'destructive' \| 'outline' \| 'secondary' \| 'ghost' \| 'link' \| 'tab' \| 'success' \| 'warning' \| 'danger'` | `'default'` | Visual style variant |
| `size` | `'default' \| 'sm' \| 'lg' \| 'icon' \| 'xs'` | `'default'` | Size preset |
| `asChild` | `boolean` | `false` | Use child element as button root |
| `className` | `string` | - | Additional Tailwind classes |

### Card

Container component with structural sub-components.

```tsx
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardContent, 
  CardFooter,
  cardVariants 
} from '@ury/ui';

<Card variant="elevated" padding="lg">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text</CardDescription>
  </CardHeader>
  <CardContent>Main content area</CardContent>
  <CardFooter>Footer actions</CardFooter>
</Card>
```

**Card Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'elevated' \| 'outlined' \| 'ghost'` | `'default'` | Card style variant |
| `padding` | `'none' \| 'sm' \| 'default' \| 'lg' \| 'xl'` | `'default'` | Internal padding |

**Sub-components:**

| Component | Purpose |
|-----------|---------|
| `CardHeader` | Title and description container |
| `CardTitle` | Heading element (h3) |
| `CardDescription` | Muted descriptive text |
| `CardContent` | Main body content |
| `CardFooter` | Actions and metadata |

### Other Components

```tsx
// Available components
import { 
  Badge,      // Status indicators
  Dialog,     // Modal dialogs (Radix-based)
  Input,      // Form text input
  Select,     // Dropdown selection
  Spinner,    // Loading indicator
  Loader,     // Full-page loader
  Toast,      // Notification toast
} from '@ury/ui';
```

## How It Works

### CVA Pattern

Components use CVA for type-safe variant management:

```tsx
const buttonVariants = cva(
  // Base classes applied to all variants
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      // Define variant groups
      variant: {
        default: "bg-primary text-white hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

### Class Merging with `cn()`

The `cn()` utility merges Tailwind classes with proper precedence:

```tsx
import { cn } from '@ury/ui';

// Handles conditional classes
className={cn(
  "base-classes",
  isActive && "active-classes",
  className // Consumer overrides
)}

// Resolves Tailwind conflicts (later wins)
cn("px-4 py-2", "px-6") // → "py-2 px-6"
```

### Component Structure

```tsx
const Component = React.forwardRef<HTMLElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <element
        className={cn(componentVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Component.displayName = "Component";
```

## Extension Points

### Adding a New Component

```tsx
// packages/ui/src/components/alert.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4",
  {
    variants: {
      variant: {
        default: "bg-white border-gray-200",
        error: "bg-red-50 border-red-200 text-red-800",
        success: "bg-green-50 border-green-200 text-green-800",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  )
);
Alert.displayName = "Alert";
```

### Adding Variants to Existing Components

```tsx
// Extend buttonVariants with new variant
const buttonVariants = cva("...base classes...", {
  variants: {
    variant: {
      // ...existing variants
      premium: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
    },
    // ...rest of config
  },
});
```

### Customizing Theme Colors

Components reference CSS custom properties (defined in app CSS):

```css
:root {
  --primary: 222 47% 31%;
  --primary-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
}
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/ui/src/components/button.tsx` | Button component with variants |
| `packages/ui/src/components/card.tsx` | Card container component |
| `packages/ui/src/components/badge.tsx` | Badge/status indicators |
| `packages/ui/src/components/dialog.tsx` | Modal dialog (Radix UI) |
| `packages/ui/src/components/input.tsx` | Text input fields |
| `packages/ui/src/lib/utils.ts` | `cn()` class merging utility |
| `packages/ui/package.json` | Package configuration |

## Dependencies

```json
{
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-select": "^2.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

## Gotchas

### Tailwind Classes Must Be Complete Strings

❌ **Don't** - Tailwind won't detect partial classes:
```tsx
const color = "red";
className={`bg-${color}-500`}  // Won't work!
```

✅ **Do** - Use complete class names:
```tsx
variant: {
  red: "bg-red-500 text-white",
  blue: "bg-blue-500 text-white",
}
```

### Forward Ref Required

All components must use `forwardRef` for proper integration:

```tsx
const Component = React.forwardRef<HTMLElement, Props>(
  (props, ref) => <element ref={ref} {...props} />
);
Component.displayName = "Component"; // Required for React DevTools
```

### Variant Props Type Export

Export both the component and its variant props type:

```tsx
export { Button, buttonVariants };
export type { ButtonProps };
```

### CVA Variants Override Order

Later variants override earlier ones. Order matters in the `cn()` call:

```tsx
// variant classes can be overridden by className
className={cn(buttonVariants({ variant, size }), className)}

// className can be overridden by variant
className={cn(className, buttonVariants({ variant, size }))}  // Wrong!
```

### Default Variants Must Be Defined

Always provide `defaultVariants` for predictable behavior:

```tsx
{
  variants: { /* ... */ },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
}
```
