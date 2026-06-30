# UI Components

This directory contains reusable UI components built with class-variance-authority (CVA) for consistent styling and variants.

## Components

### Button
A versatile button component with multiple variants and sizes.

```tsx
import { Button } from "@/components/ui"

// Variants: default, destructive, outline, secondary, ghost, link, success, warning, danger
// Sizes: default, sm, lg, icon, xs

<Button variant="default" size="default">
  Click me
</Button>

<Button variant="success" size="sm">
  Success
</Button>

<Button variant="danger" size="lg">
  Delete
</Button>
```

### Select
A styled select component with error states.

```tsx
import { Select } from "@/components/ui"

// Variants: default, error, success
// Sizes: default, sm, lg

<Select variant="default" size="default">
  <option value="">Select an option</option>
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</Select>

<Select variant="error" size="sm">
  <option value="">Select an option</option>
</Select>
```

### Input
A styled input component with various states.

```tsx
import { Input } from "@/components/ui"

// Variants: default, error, success, search
// Sizes: default, sm, lg

<Input 
  type="text" 
  placeholder="Enter text..." 
  variant="default" 
  size="default" 
/>

<Input 
  type="email" 
  placeholder="Email" 
  variant="error" 
  size="sm" 
/>
```

### Badge
A badge component for status indicators and labels.

```tsx
import { Badge } from "@/components/ui"

// Variants: default, secondary, destructive, outline, success, warning, danger, info, pending, completed, cancelled
// Sizes: default, sm, lg

<Badge variant="success">Completed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Error</Badge>
<Badge variant="info" size="sm">Info</Badge>
```

### Card
A card component with header, content, and footer sections.

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui"

// Variants: default, elevated, outlined, ghost
// Padding: none, sm, default, lg, xl

<Card variant="default" padding="default">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Dialog
A modal dialog component with overlay and content sections.

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui"

// Variants: default, fullscreen
// Sizes: default, sm, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl, 7xl

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent variant="default" size="lg">
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <div>Dialog content</div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleConfirm}>
        Confirm
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Usage

Import components from the UI index:

```tsx
import { Button, Input, Select, Badge, Card, Dialog } from "@/components/ui"
```

Or import individual components:

```tsx
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
```

## Styling

All components use Tailwind CSS classes and CSS custom properties for theming. The components are designed to work with the design system defined in `tailwind.config.js` and `src/index.css`.

## Variants

Components use class-variance-authority (CVA) for consistent variant management. Each component exports its variants function for advanced customization:

```tsx
import { buttonVariants } from "@/components/ui/button"

const customButtonClass = buttonVariants({ 
  variant: "outline", 
  size: "lg",
  className: "custom-class" 
})
``` 