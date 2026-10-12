/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "hsl(var(--primary-50))",
          100: "hsl(var(--primary-100))",
          200: "hsl(var(--primary-200))",
          300: "hsl(var(--primary-300))",
          400: "hsl(var(--primary-400))",
          500: "hsl(var(--primary-500))",
          600: "hsl(var(--primary-600))",
          700: "hsl(var(--primary-700))",
          800: "hsl(var(--primary-800))",
          900: "hsl(var(--primary-900))",
          950: "hsl(var(--primary-950))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          50: "hsl(var(--accent-50))",
          100: "hsl(var(--accent-100))",
          200: "hsl(var(--accent-200))",
          300: "hsl(var(--accent-300))",
          400: "hsl(var(--accent-400))",
          500: "hsl(var(--accent-500))",
          600: "hsl(var(--accent-600))",
          700: "hsl(var(--accent-700))",
          800: "hsl(var(--accent-800))",
          900: "hsl(var(--accent-900))",
          950: "hsl(var(--accent-950))",
        },
        gray: {
          50: "hsl(var(--gray-50))",
          100: "hsl(var(--gray-100))",
          200: "hsl(var(--gray-200))",
          300: "hsl(var(--gray-300))",
          400: "hsl(var(--gray-400))",
          500: "hsl(var(--gray-500))",
          600: "hsl(var(--gray-600))",
          700: "hsl(var(--gray-700))",
          800: "hsl(var(--gray-800))",
          900: "hsl(var(--gray-900))",
          950: "hsl(var(--gray-950))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        white: "hsl(var(--white))",
        black: "hsl(var(--black))",
      },
      fontFamily: {
        // `sans` is the app default; both scripts share IBM Plex Sans Arabic
        // so the UI keeps one voice across a language switch.
        sans: ['var(--font-sans)'],
        numeric: ['var(--font-numeric)'],
        inter: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Elevation scale. Two-layer shadows (a tight contact shadow plus a
      // wider ambient one) so surfaces read as lifted rather than smudged.
      // Deliberately low-alpha: elevation should be felt, not seen.
      boxShadow: {
        xs: "0 1px 1px 0 hsl(var(--black) / 0.04)",
        sm: "0 1px 2px 0 hsl(var(--black) / 0.05)",
        DEFAULT:
          "0 1px 2px 0 hsl(var(--black) / 0.06), 0 1px 3px 0 hsl(var(--black) / 0.08)",
        md: "0 2px 4px -1px hsl(var(--black) / 0.06), 0 4px 8px -2px hsl(var(--black) / 0.08)",
        lg: "0 4px 8px -2px hsl(var(--black) / 0.06), 0 12px 20px -4px hsl(var(--black) / 0.10)",
        xl: "0 8px 16px -4px hsl(var(--black) / 0.08), 0 24px 40px -8px hsl(var(--black) / 0.14)",
      },
      // One shared motion vocabulary: 150ms for control state changes,
      // 200ms for surfaces entering. Easing is a single decelerating curve.
      transitionDuration: {
        DEFAULT: "140ms",
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      // `out` is redefined to the same curve so `ease-out` — the easing every
      // component and call site already reaches for — *is* the system easing,
      // rather than a second, slightly different one.
      transitionTimingFunction: {
        DEFAULT: "var(--ease-out)",
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
        emphasis: "var(--ease-emphasis)",
      },
      keyframes: {
        "overlay-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "dialog-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Content appearing in place — cards, panels, empty states.
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Direction-aware: --slide-from flips sign under [dir=rtl], so a row
        // always enters from the side the reader starts on.
        "slide-in": {
          from: { opacity: "0", transform: "translateX(var(--slide-from))" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // Side sheets / drawers, which travel the full panel width.
        "sheet-in-end": {
          from: { opacity: "0", transform: "translateX(calc(var(--slide-from) * 4))" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Skeleton shimmer. Travels along the inline axis, so it sweeps with
        // the reading direction rather than against it in Arabic.
        shimmer: {
          "100%": { transform: "translateX(calc(var(--slide-from) / 8 * 2500%))" },
        },
        // Live/among-us indicators: a calm breath, not a strobe.
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        // A ring that expands and fades once — used for "order sent" and
        // "payment received", where a cashier needs positive confirmation.
        "ping-once": {
          from: { opacity: "0.5", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(1.9)" },
        },
        "check-in": {
          from: { opacity: "0", transform: "scale(0.6)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // A total that changed. Nudges up and settles, so the eye catches the
        // change without the number moving far enough to be unreadable.
        "value-in": {
          from: { opacity: "0", transform: "translateY(-30%)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Invalid input / rejected action. Short and small on purpose.
        nudge: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-3px)" },
          "75%": { transform: "translateX(3px)" },
        },
        "progress-indeterminate": {
          from: { transform: "translateX(-100%) scaleX(0.4)" },
          to: { transform: "translateX(250%) scaleX(0.4)" },
        },
      },
      animation: {
        "overlay-in": "overlay-in var(--duration-fast) var(--ease-out)",
        "dialog-in": "dialog-in var(--duration-base) var(--ease-out)",
        "fade-in": "fade-in var(--duration-base) var(--ease-out) both",
        "fade-in-up": "fade-in-up var(--duration-base) var(--ease-out) both",
        "slide-in": "slide-in var(--duration-base) var(--ease-out) both",
        "sheet-in-end": "sheet-in-end var(--duration-slow) var(--ease-out) both",
        "scale-in": "scale-in var(--duration-base) var(--ease-out) both",
        shimmer: "shimmer 1.6s var(--ease-in-out) infinite",
        "pulse-soft": "pulse-soft 2s var(--ease-in-out) infinite",
        "ping-once": "ping-once 600ms var(--ease-out) forwards",
        "check-in": "check-in 320ms var(--ease-emphasis) both",
        "value-in": "value-in var(--duration-fast) var(--ease-out) both",
        nudge: "nudge 180ms var(--ease-in-out)",
        "progress-indeterminate":
          "progress-indeterminate 1.1s var(--ease-in-out) infinite",
      },
      spacing: {
        'order-panel': 'var(--order-panel-width)',
        'badge-min': 'var(--badge-min-width)',
        'dialog-max-w': 'var(--dialog-max-width)',
        'dialog-max-h': 'var(--dialog-max-height)',
      },
    },
  },
  plugins: [],
};
