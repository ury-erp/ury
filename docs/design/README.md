# URY Design System

One visual language across five frontends: `pos`, `frontend` (dashboard),
`self-order`, `urypos` and `mosaic`.

The React apps (`pos`, `frontend`, `self-order`) share it through the
`@ury/ui` workspace package. The two Vue apps sit **outside** the yarn
workspace and cannot import it, so they carry hand-written equivalents at the
bottom of their own `src/index.css`. **Changing a duration, easing or keyframe
means changing it in both places** — `packages/ui/src/styles/theme.css` and
the block marked *"Motion + RTL for the Vue apps"*.

## Typography

| Token | Value |
|---|---|
| `--font-sans` | `'IBM Plex Sans Arabic'`, then system fallbacks |
| `--font-numeric` | same family, used with tabular figures |

**One family for both scripts.** IBM Plex Sans Arabic ships real Latin glyphs,
so Arabic and English share a skeleton, weight and rhythm instead of the UI
changing personality when the language switches.

It is **self-hosted** in `ury/public/fonts/` (served at `/assets/ury/fonts/`),
declared in `packages/ui/src/styles/fonts.css`. This is deliberate: a POS
terminal is frequently offline or throttled, and a CDN font that fails to load
would drop the whole interface to a default serif. Only the `arabic` and
`latin` subsets ship; the browser fetches a subset only when the page contains
glyphs in its `unicode-range`, so an English user never downloads the Arabic
file.

`fonts.css` is generated. To change weights, re-fetch from Google Fonts with a
modern User-Agent (so you get `woff2`, not `ttf`), drop the files in
`ury/public/fonts/`, and regenerate with local `/assets/ury/fonts/` URLs.

### Numbers

Money, quantities and counters use **tabular figures** via `.numeric` or
`.tabular-nums`, so digits line up in a column and a changing total does not
shift the layout sideways. Body text uses proportional figures.

Never format a number in a component — pass an already-formatted string from
`@ury/core`'s helpers, which follow the active locale (see
`docs/i18n/README.md`). A component that formats can render the wrong digit
system or separator.

## Motion

Four speeds, one curve:

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 90ms | press / release feedback |
| `--duration-fast` | 140ms | hover, focus, colour changes |
| `--duration-base` | 200ms | surfaces entering, expand/collapse |
| `--duration-slow` | 280ms | full-screen or sheet transitions |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | everything |
| `--ease-emphasis` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | confirmations only |

**A POS is used under time pressure.** Anything slower than 250ms starts to
feel like the terminal is lagging, so the slow tier is reserved for surfaces
entering and never for feedback. `--ease-emphasis` overshoots slightly and is
reserved for genuine confirmations (payment taken, order sent).

Available animations: `fade-in`, `fade-in-up`, `slide-in`, `sheet-in-end`,
`scale-in`, `overlay-in`, `dialog-in`, `shimmer`, `pulse-soft`, `ping-once`,
`check-in`, `value-in`, `nudge`, `progress-indeterminate`.

Utilities: `.stagger` / `.stagger-fast` (set `--i` to the index; capped at 8
steps), `.press`, `.lift`, `.skeleton`, `.progress-track`, `.ring-focus`,
`.bidi-isolate`, `.rtl-flip`.

### Rules

- **Motion is a garnish, never a gate.** Everything is disabled under
  `prefers-reduced-motion: reduce`, so nothing here may carry information that
  is not also in the markup. The spinner is the one exemption — it is a status
  indicator, not decoration.
- **Do not tween a value through intermediate numbers.** `AnimatedNumber`
  slides the new figure in rather than counting up: on a bill total, a tween
  renders numbers that were never real, and a cashier reading mid-animation
  would see a figure that is simply wrong.
- **Entrance animations are capped.** A 200-item menu staggers over ~320ms,
  not 200 × 40ms.
- **Direction-aware slides** use `--slide-from`, which flips sign under
  `[dir='rtl']`. Do not write `translateX` with a literal sign.

### Adding a keyframe

If a rule references an animation from inside a pseudo-element or a Vue
`:class` binding, declare the `@keyframes` **outside** `@layer` in
`motion.css`. Tailwind only emits a keyframe block when it sees the matching
`animate-*` utility in scanned content — this is exactly how the skeleton
shimmer silently failed to animate once already.

## Components

`@ury/ui` exports. Prefer these over hand-rolling; each one exists because the
same thing had drifted across pages.

| Component | Notes |
|---|---|
| `Button` | `loading` keeps the label mounted and hidden, so the width never changes mid-action. `fullWidth`, sizes `xs`–`lg`, `icon`, `icon-sm`. |
| `Card` | `variant="interactive"` for a card that is itself a control (menu item, KPI tile that navigates) — adds lift, press and a focus ring. |
| `Input` / `Textarea` / `Select` | Shared control heights: sm 36 / default 44 / lg 48. Default is 44px, the smallest comfortable touch target on a POS tablet. |
| `Field` | Label + control + error/hint. Pass the control's `id` as `htmlFor` and wire `aria-describedby` to `` `${htmlFor}-message` ``. |
| `Skeleton` / `SkeletonText` | Shapes: `text`, `heading`, `control`, `block`, `circle`. Put `aria-busy` on the **container**, not each block. |
| `EmptyState` | `icon`, `title`, `description`, `action`. An empty state should say what is missing *and* what to do about it. |
| `AnimatedNumber` | Takes a formatted string. Skips the animation on first render. |
| `StatCard` | Animated value, `isLoading`, `tone` for a logical start-edge accent. |
| `DataTable` | `skeletonRows` (default 6), `stickyHeader`, `onRowClick` (keyboard accessible), zebra striping, `align: 'right'` means *logical end*. |
| `Dialog` | Focus trap, `closeOnEscape`, overlay fade, entrance. |
| `Badge`, `Spinner`, `Loader`, `Toast`, `Sidebar` | |

### Loading: skeleton or spinner?

Use a **skeleton** whenever the final layout is known — the page keeps its
shape, so nothing jumps when data lands. Use a **spinner** for an action with
no layout to preview (submitting, printing).

## RTL

- Use **logical** utilities, never physical: `ms-`/`me-`, `ps-`/`pe-`,
  `start-`/`end-`, `text-start`/`text-end`, `border-s`/`border-e`. They are
  identical in LTR, so there is no reason to use the physical form.
- **Never wrap a logical utility in an `isRTL ? … : …` branch** — that
  double-flips and lands the element on the wrong side. This has been fixed
  twice already in `LayoutView`/`TableLayoutView`.
- Wrap non-language values (invoice ids, amounts, ratios, times) in
  `.bidi-isolate`, or the bidi algorithm can reorder `3 / 10`.
- Mirror only *directional* icons (chevrons, arrows) with `.rtl-flip`.

See `docs/i18n/README.md` for the language and formatting side.
