/** @type {import('tailwindcss').Config} */

/**
 * Semantic colour tokens, resolved from CSS custom properties declared in
 * `src/index.css`. They mirror `packages/ui/src/styles/theme.css` one for one:
 * urypos sits outside the yarn workspace and cannot import `@ury/ui`, so the
 * values are re-declared there rather than imported. Changing a colour means
 * changing it in both places — see docs/design/README.md.
 *
 * Writing them as `hsl(var(--x) / <alpha-value>)` keeps Tailwind's opacity
 * modifiers working, so `bg-card/70` still does what it looks like it does.
 */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./src/**/*.{html,jsx,tsx,vue,js,ts}",
    'node_modules/flowbite-vue/**/*.{js,jsx,ts,tsx}',
    'node_modules/flowbite/**/*.{js,jsx,ts,tsx}',
  ],
  /**
   * Opt-in, never automatic.
   *
   * This was unset, which leaves Tailwind on its `media` default — so the ~400
   * `dark:` utilities scattered through the components fired on any waiter
   * whose phone was in dark mode, producing a half-dark interface nobody
   * designed or tested. Nothing in this codebase ever adds a `.dark` class, so
   * switching to the class strategy makes those rules inert while they are
   * removed.
   */
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: token('card'),
        'card-foreground': token('card-foreground'),
        popover: token('popover'),
        'popover-foreground': token('popover-foreground'),
        primary: token('primary'),
        'primary-foreground': token('primary-foreground'),
        secondary: token('secondary'),
        'secondary-foreground': token('secondary-foreground'),
        muted: token('muted'),
        'muted-foreground': token('muted-foreground'),
        accent: token('accent'),
        'accent-foreground': token('accent-foreground'),
        destructive: token('destructive'),
        'destructive-foreground': token('destructive-foreground'),
        success: token('success'),
        'success-foreground': token('success-foreground'),
        warning: token('warning'),
        'warning-foreground': token('warning-foreground'),
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(74, 48, 30, 0.06), 0 4px 16px rgba(74, 48, 30, 0.06)',
        raised: '0 8px 24px rgba(74, 48, 30, 0.12)',
        sheet: '0 -8px 32px rgba(74, 48, 30, 0.16)',
      },
    },
  },
  plugins: [require('flowbite/plugin')],
}
