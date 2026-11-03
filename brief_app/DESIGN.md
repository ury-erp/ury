# Brief PWA design rules

Source of truth: `/Users/safwan/Code/URY/ury-design` (AGENTS.md, docs/). `src/tokens.css` is a vendored copy of `dist/tokens.css` plus hand-written scales; re-copy the colour blocks when the design system changes. Do not edit generated values in place.

- Colour: only `hsl(var(--token))`. No hex, rgb(), or palette names in components. Pair every surface with its foreground (`primary`/`primary-foreground`, `card`/`card-foreground`). Primary is crimson. Dark mode comes from the tokens (`prefers-color-scheme`); never hand-pick a dark colour.
- Type: Geist for text, Geist Mono for amounts and numeric columns, `tabular-nums` on any figure. Sizes from `--text-*` (11/12/12.5/14/16/18/20/30px), weights 400/500/600. No uppercase on titles or table headers.
- Space: `--space-*` (4px unit), `--panel-x/--panel-y`, `--grid-gap`. Chat cards use 12px padding and an 8px rhythm. Radius `--radius-md/lg` (not xl on new components, pill only for chips and dots). Shadow `--shadow-xs/sm` at rest, `--shadow-xl` only for sheets.
- Touch: every tap target is at least `--touch` (44px). Focus ring is `2px hsl(var(--ring))` with 2px offset. Motion is `--dur` (150ms) with `--ease`; honour reduced motion.
- Numbers never wrap: `white-space:nowrap` on every numeric cell, amount and KPI. Long text truncates with ellipsis and a `title` attribute; horizontal scroll is the last resort.
- Tone (good/bad/neutral) for number cards, deltas and chips: bg `--success-tint` / `--destructive-tint` / `--muted`, border the matching `-tint-border`, text `--success-800` / `--destructive-800` / `--foreground`. Never rely on colour alone: keep the arrow or sign. Use `--warning-tint` with `--warning-800` for data-quality notes.
- Number cards: label `--text-2xs` muted, value `--text-lg`/`--text-3xl` semibold tabular, delta chip beside or below it; the whole card is a `.card` panel (border, `--card`, `--radius-lg`).
- Dashboard card grids: `display:grid; gap:var(--grid-gap)`; one column at 360px, `repeat(auto-fit,minmax(9rem,1fr))` for number cards; panels fill their cell (`width:100%`, `min-width:0`) and own their padding.
- Charts: series colours are `hsl(var(--chart-1..5))` (aliases for primary, warning, success, chat-accent, text-tertiary; the design system has no chart tokens, so these flip with dark mode). Tracks use `--hair2`. Pie/donut: stroke width from the 120 viewBox, legend rows with swatch, name (ellipsis), `%` muted, amount in mono; do not encode meaning in colour alone and cap at 5 slices plus "Other".
- Links to dashboards are secondary/ghost buttons (hairline `--hair2` border, foreground text), never filled black or primary pills.

## Chat shell (WhatsApp pattern)

- `.app`: max-width 48rem, centred, 100dvh; at >=768px a 1px `--border` inline border over a `--muted` body. Safe-area top/left/right on `.app`; safe-area bottom on `.tabs`.
- Top bar: 3.5rem tall, padding `0 8px 0 16px`, 1px bottom border; title 17px/600, one-line subtitle 12px muted (brief as-of time). Right side: 40px circular transparent icon buttons with 24px glyphs (Call, only when voice is available; Kebab overflow menu).
- Overflow menu: popover anchored top-right, `role=menu`, 48px items at 15px, radius 8px, shadow, min-width 12rem; Escape/outside click closes; first item focused on open. Items: Settings, WhatsApp (if enabled), Add to home screen (if not standalone), hairline, Sign out.
- Settings sheet: profile row (40px initials avatar + "Signed in as"), icon Close button in the header.
- Tab bar: 3.5rem + safe-area bottom, no top line; 24px icon over an 11px/500 label; active item shows a 64x32 radius-16 `--accent` pill behind the icon with primary text colour.
