# @ury/ui

The shared design-system component library for URY's React frontends (`pos/` and `frontend/`). This is the single source of truth for all UI in the app — never hand-roll raw `<input>`, `<button>`, or other form controls. Every component here is built for consistency, accessibility, and URY's operational needs.

## Color Tokens

All colors are semantic CSS custom properties (defined in `src/styles/theme.css`) and automatically flip in dark mode. Use these tokens, never raw Tailwind palette classes. The Tailwind preset resolves them to HSL values.

| Token Family | Base Hue | Usage |
| --- | --- | --- |
| **primary** | `221.2° 83.2% 53.3%` (blue) | Interactive controls, primary actions, links. Default for `Button`, `Badge`, links, focus rings. |
| **accent** | `350° 83% 53%` (red/pink) | Secondary interactive elements, alternate accent states. |
| **success** | `142° 76% 36%` (green) | Positive states, confirmations, completed actions. Use `success-600` for text, `success-100` for light backgrounds. |
| **warning** | `38° 92% 50%` (amber) | Attention states, cautions, items needing review—**not errors**. Use `warning-600` for icons, `warning-100` for light backgrounds. |
| **destructive** | `0° 84.2% 60.2%` (red) | Delete actions, errors, critical failures. Use sparingly. |
| **gray** | `240° (5-20%)` (neutral) | Borders, disabled states, secondary text, backgrounds. Eleven-step ramp (50–950). |
| **muted** | `210° 40% 96%` | Placeholder text, disabled inputs, de-emphasized content. |

## Components

All components are imported from `'@ury/ui'`:

| Component | Purpose |
| --- | --- |
| **Button** | Clickable control for primary, secondary, outline, and destructive actions. Supports size variants. |
| **Input** | Text input field with border, focus ring, and disabled state support. |
| **Textarea** | Multi-line text input with the same styling system as `Input`. |
| **Select** | Dropdown select built on Radix UI primitives. Handles focus, keyboard navigation, and dark mode. |
| **Checkbox** | Checkbox input with label support. Follows native semantics. |
| **Badge** | Compact label or status indicator. Use for orders, table metadata, statuses (success, warning, danger, pending, etc.). |
| **Card** | Container with border, background, and optional elevation. Variants: `default`, `elevated`, `outlined`, `ghost`. |
| **StatCard** | Metric card for dashboards: label, numeric value, icon, and optional tone (primary, success, warning, danger). |
| **Dialog** | Modal overlay with title, content, and footer. Handles focus trap and escape-to-close. |
| **DataTable** | Simple table component for structured data. Handles overflow, sorting hooks. |
| **Toast** | Toast notification built on react-toastify. Use `toast()` and `toast.error()` for messages. |
| **Spinner** | Animated loading indicator. Optionally shows a message. Respects `prefers-reduced-motion`. |
| **Loader** | Deprecated. Use `Spinner` directly; `Loader` is a thin wrapper for backward compatibility. |
| **Alert** | Alert box for warnings, info, or success messages. Supports multiple tones/variants. |
| **Tabs** | Tab navigation. Use for switching between related content views. |

## Conventions

These are the agreed patterns from URY's implementation. Follow them to keep pages consistent without constant refinement.

### Typography

- **Page title**: `text-xl font-semibold text-gray-900` — use for `<h1>` and main page headings.
- **Section header**: `text-lg font-semibold` — use for `<h2>` within a page.
- **Body/label text**: `text-sm font-medium` — default for most labels, table cells, and reading content.
- **Small captions/stat labels**: `text-xs font-medium text-gray-500` — never `uppercase` for readable content.

### Layout & Spacing

- **Page root wrapper**: `<div className="space-y-6">` — no extra `p-*`, `max-w-*`, or `mx-auto` because `DashboardLayout` already provides `p-6`.
- **Section eyebrow labels**: Use `text-xs font-semibold uppercase tracking-wide text-gray-400` only for short, non-critical labels (e.g., "ORDER TYPE", "SECTION"). Never use `uppercase` on table headers, section titles, or full sentences.
- **Card padding**: `Card`'s default is `p-4`. Don't override casually; if you need different padding, use the `padding` prop (`padding="sm"` = `p-3`).

### Borders & Radii

- **Border radius**: Always `rounded-lg` (token: `0.5rem`). Use `rounded-lg` everywhere except where a component like `Dialog` has an established different radius (which it doesn't—it's also `rounded-lg`).
- **Never** use `rounded-xl` or `rounded-2xl` unless changing a component's established style across the whole app.
- **Borders**: Use `border-border` (the semantic token that flips in dark mode), not hard colors.

### Motion

- **Transition**: All state changes use `transition-[...] duration-150 ease-out` — one shared curve and duration across buttons, inputs, badges, etc.
- **Reduced motion**: Animations disappear when the user has requested `prefers-reduced-motion`. The spinner (`animate-spin`) is exempt because it's a status indicator, not decoration.

## How to Consume This Package

### Components & Utilities

```jsx
import { Button, Dialog, Input, Card, Badge, Spinner } from '@ury/ui';
```

All components are exported directly from the package. Use named imports; there is no default export (except the deprecated `Loader`).

### Theme CSS

Add the theme to your app's root CSS file:

```css
@import '@ury/ui/styles/theme.css';
```

This defines all CSS custom properties (--primary, --warning, --success, etc.) and flips them in dark mode via `.dark` class. It also sets up base styles (border color reset, reduced-motion support).

### Tailwind Configuration

In your app's `tailwind.config.js`, add the `@ury/ui` preset:

```js
import preset from '@ury/ui/tailwind-preset';

export default {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    '../packages/ui/src/**/*.{ts,tsx}', // ← Include component source
  ],
};
```

The preset extends Tailwind with semantic color tokens, border radius, and motion utilities. Your app's content array **must** include `../packages/ui/src/**/*.{ts,tsx}` so Tailwind scans the component source for class names.

### Dark Mode

Wrap your app root in a `.dark` class to enable dark mode:

```jsx
export default function App() {
  const isDark = /* your logic */;
  return (
    <div className={isDark ? 'dark' : ''}>
      {/* your page */}
    </div>
  );
}
```

All semantic colors (primary, accent, warning, success, gray, etc.) automatically invert their lightness in dark mode. Gray scales reverse (50 becomes darker, 950 becomes lighter).

---

**Last updated:** August 2026. This README is the definitive guide for building consistent UI in URY. If you're unsure about a color choice, component variant, or spacing decision, re-read this file before guessing.
