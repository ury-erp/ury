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
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          50: "hsl(var(--warning-50))",
          100: "hsl(var(--warning-100))",
          200: "hsl(var(--warning-200))",
          300: "hsl(var(--warning-300))",
          400: "hsl(var(--warning-400))",
          500: "hsl(var(--warning-500))",
          600: "hsl(var(--warning-600))",
          700: "hsl(var(--warning-700))",
          800: "hsl(var(--warning-800))",
          900: "hsl(var(--warning-900))",
          950: "hsl(var(--warning-950))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          50: "hsl(var(--success-50))",
          100: "hsl(var(--success-100))",
          200: "hsl(var(--success-200))",
          300: "hsl(var(--success-300))",
          400: "hsl(var(--success-400))",
          500: "hsl(var(--success-500))",
          600: "hsl(var(--success-600))",
          700: "hsl(var(--success-700))",
          800: "hsl(var(--success-800))",
          900: "hsl(var(--success-900))",
          950: "hsl(var(--success-950))",
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
        inter: ['Inter', 'sans-serif'],
        // Geist / Geist Mono (https://github.com/vercel/geist-font),
        // self-hosted via @fontsource — matches ury-app.html's type system.
        // Redefines the default `font-sans`/`font-mono` utilities so every
        // existing `font-mono` call site (numeric table cells, amounts)
        // picks up Geist Mono without call-site changes.
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
        DEFAULT: "150ms",
      },
      // `out` is redefined to the same curve so `ease-out` — the easing every
      // component and call site already reaches for — *is* the system easing,
      // rather than a second, slightly different one.
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
        out: "cubic-bezier(0.2, 0, 0, 1)",
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
      },
      animation: {
        "overlay-in": "overlay-in 150ms cubic-bezier(0.2, 0, 0, 1)",
        "dialog-in": "dialog-in 200ms cubic-bezier(0.2, 0, 0, 1)",
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
