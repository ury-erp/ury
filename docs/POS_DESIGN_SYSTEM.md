# POS Design System

This document outlines the design elements, styling conventions, colors, and component structures used in the `/pos` UI (Point of Sale frontend). Agents must reference this file when creating or modifying POS UI elements to maintain a consistent aesthetic.

## 1. Global Styling & Theming
The POS app uses **Tailwind CSS** with CSS variables (HSL values) for theming. Both light and dark modes are supported.

### Colors
Always use the semantic Tailwind classes (e.g., `bg-primary`, `text-muted-foreground`, `border-border`) rather than hardcoding hex values. 

- **Background & Foreground**:
  - `background`: Main app background.
  - `foreground`: Default text color.
- **Brand Colors**:
  - `primary`: Used for primary actions, active states, and emphasis. (Shades 50-950 available).
  - `secondary`: Used for secondary actions and less prominent highlights.
  - `accent`: Used for hover states, subtle highlights, and interactive elements.
- **Status & Feedback**:
  - `destructive`: Red hues for errors, deletions, and critical warnings.
- **Structural**:
  - `muted`: Used for subtle backgrounds and disabled text.
  - `border`: Default border color for all elements.
  - `input`: Border color specifically for form inputs.
  - `ring`: Focus ring color for accessibility.
- **Surfaces**:
  - `card`: Background for card components (e.g., menu items).
  - `popover`: Background for dropdowns, tooltips, and floating panels.
- **Grays**: Comprehensive gray scale from 50 to 950.

### Dark Mode
Dark mode is activated via the `.dark` class. The CSS variables automatically swap to dark-themed HSL values, ensuring high contrast and a premium feel. Avoid manually checking for dark mode (e.g., `dark:bg-gray-800`) if a semantic color (e.g., `bg-card`) already handles it.

### Typography
- **Font Family**: `Inter` (`font-inter`).
- Rely on Tailwind's default typography sizing (`text-sm`, `text-base`, `text-lg`, `text-xl`, etc.).

### Border Radius
- Use Tailwind's default rounded classes, which map to the CSS variables:
  - `rounded-lg`: Standard radius (`var(--radius)`).
  - `rounded-md`: `calc(var(--radius) - 2px)`.
  - `rounded-sm`: `calc(var(--radius) - 4px)`.

### Custom Spacing & Sizing
- `w-order-panel`: Fixed width for the order panel (`24rem`).
- `w-badge-min`: Minimum width for badges (`1.5rem`).
- `max-w-dialog-max-w` / `max-h-dialog-max-h`: Dialog constraints (`90rem` / `90vh`).

---

## 2. Layout & Sections

### Main Layout (`LayoutView.tsx`)
The standard POS layout consists of:
1. **Sidebar**: Left navigation/status panel.
2. **Header**: Top bar containing user profile, search, and global actions.
3. **Main Content Area**: Grid or list for products/menus.
4. **Order Panel**: Right-side panel detailing the current transaction.
5. **Footer**: Bottom bar for quick actions or status info.

### Sidebar (`Sidebar.tsx`, `OrderStatusSidebar.tsx`)
- Contains main navigation icons or order status filters.
- **Style**: Typically uses a distinct surface color (e.g., `bg-card` or `bg-background` with a right border `border-r border-border`).
- Icons should have hover states (e.g., `hover:bg-accent hover:text-accent-foreground`).
- Active items should be highlighted (e.g., `bg-primary text-primary-foreground` or a distinct `accent` background).

### Header & User Profile
- Contains the search bar, screen size toggles, and user profile icon.
- **User Profile Icon**: Usually circular (`rounded-full`), displaying an avatar or initials. Clickable to reveal a popover/dropdown with options (Settings, Logout, etc.).
- Dropdown options should use `bg-popover` and have `hover:bg-accent` for items.

### Order Panel (`OrderPanel.tsx`)
- Positioned on the right side. Fixed width using the custom `w-order-panel` class.
- Contains the list of selected items, subtotal, taxes, discount, and the main "Pay" or "Checkout" button (which should be prominent, e.g., `bg-primary text-primary-foreground w-full py-4 text-lg font-semibold rounded-lg`).
- Items in the order panel should have a subtle border or separator (`border-b border-border`).

---

## 3. UI Components

### Menu Cards (`MenuCard.tsx`)
- Represents a product or category in the main grid.
- **Style**: Use `bg-card text-card-foreground rounded-lg border border-border overflow-hidden`.
- **Interaction**: Add hover effects to make the interface feel dynamic and responsive: `transition-all duration-200 hover:shadow-md hover:border-primary/50 cursor-pointer`.
- **Images**: Ensure images cover the designated area (`object-cover`) with a consistent aspect ratio.
- **Typography**: Product name should be bold (`font-semibold`); price should be distinct (often using `text-primary` or `font-medium`).

### Dialogs / Modals (`PaymentDialog.tsx`, `ProductDialog.tsx`, `TableSelectionDialog.tsx`)
- Used for focused tasks (payment, selecting variants, choosing tables).
- **Style**: Overlay should use a backdrop blur or semi-transparent dark background (`bg-black/50 backdrop-blur-sm`).
- The modal container should use `bg-background rounded-lg shadow-lg border border-border max-w-dialog-max-w max-h-dialog-max-h overflow-auto`.
- Include a clear close button (X icon) in the top right.

### Select & Dropdowns (`CustomerSelect.tsx`, `OrderTypeSelect.tsx`)
- Custom selects should match standard input styling: `border border-input bg-background rounded-md px-3 py-2 text-sm ring-offset-background`.
- Focus states MUST have `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`.

### Search Bar (`SearchBar.tsx`)
- Typically a wide input with a search icon (magnifying glass) on the left.
- Use `pl-10` (padding left) on the input to make room for the absolute-positioned icon.
- Keep the background slightly muted (e.g., `bg-muted/50`) or use a standard input style.

---

## 4. Best Practices & Design Principles

1. **Vibrant & Premium Aesthetics**: Ensure the POS looks modern. Use the provided HSL variables to maintain the carefully curated color palette.
2. **Glassmorphism & Micro-animations**: Where appropriate, use subtle backdrop filters and `transition-all` on hover states to make the UI feel alive.
3. **Accessibility**: Maintain high contrast. Ensure all interactive elements have visible focus rings (`focus:ring-2 focus:ring-ring`).
4. **Consistency**: Do not introduce ad-hoc hex colors. Always map to the existing CSS variables in `index.css`.
5. **Component Reusability**: Build modular UI components. If a new button, card, or input style is needed, verify it doesn't already exist in `src/components/ui/` before creating a new one.
