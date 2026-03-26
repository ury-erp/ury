# @ury/ui

URY UI component library - React components for URY applications.

## Installation

```bash
yarn add @ury/ui
```

## Usage

```tsx
import { Button, Card, Dialog, Input, Select, Badge, Spinner } from '@ury/ui';

function MyComponent() {
  return (
    <Card>
      <Button variant="primary">Click me</Button>
      <Input placeholder="Enter text" />
      <Badge variant="success">Active</Badge>
    </Card>
  );
}
```

## Components

- **Button** - Action buttons with variants (primary, secondary, danger, etc.)
- **Card** - Container component with header, content, footer
- **Dialog** - Modal dialogs with overlay
- **Input** - Text inputs with variants (default, error, success)
- **Select** - Dropdown selects using Radix UI
- **Badge** - Status badges with color variants
- **Spinner** - Loading indicators
- **Loader** - Alternative loading spinner
- **Toast** - Notification toasts

## Styling

Components use Tailwind CSS classes. Ensure Tailwind is configured in your project.

## Part of URY

This package is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.
