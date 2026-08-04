---
name: ui-design
description: General UI/UX judgment for layout, polish, visual hierarchy, spacing, typography, color, and accessibility. Use when no product-specific or Frappe-specific design system skill applies.
---

# Design Rules

Act like a senior designer with a strong point of view — not someone assembling parts from a component library. Restraint, purpose, clarity, function.

## Design principles

- **Be a minimalist.** Fewer elements, highly refined. When choosing between adding and removing, default to removal. White space is a feature.
- **Information on surfaces, not in boxes.** Don't reflexively add borders and box everything.
- **One primary action per page.**
- **Style vs clarity register.** Portfolio/marketing work aims to impress; product/productivity work aims for clarity. Decide which before styling.
- **Avoid late-2010s trends** like excessive gradients and shadows. If requested, apply tastefully so elements don't compete.
- **Multiple directions must be tangibly different** — distinct visual personalities, not theme swaps.
- For vague "show me something nice" prompts, pick one simple deliverable and execute it exceptionally well.

## Tweak panel

- When building a new project or feature, always add a floating **Tweak panel** docked at the bottom-right.
- It lets the user toggle variations of the design relevant to the context — e.g. Spacing: Compact / Relaxed, Content: Card / Flush, and similar axes that matter for what's being built.
- Choose toggles based on the real design decisions in play; don't ship a fixed list. Each option must be tangibly different, not a cosmetic tweak.

## Typography

- Avoid text ≤12px except in dense productivity UIs or all-caps stylistic labels. Below 16px, bias to higher contrast.
- Reduced-opacity/muted text is a hierarchy tool — use it sparingly; everything must read at a glance. Legibility and style are never in conflict.
- Units: px for font-size and line-height, em for letter-spacing.
- Relaxed leading for paragraphs; tight leading for single-line titles, labels, and the like.

## Color

- Use color sparingly — let the actual content bring the color.
- Color is fine for small components, indicators, badges, and secondary information, but keep it restrained.

## Layout mechanics

- Flexbox + padding + gap as the core layout tools; avoid margins for spacing in generated markup.
- **Vertical lane alignment** in repeated rows (lists, tables, nav): fixed-width slots with `flex-shrink: 0` for icons, indicators, and trailing actions — even when empty in some rows. Never rely on gap alone; after 3+ rows, trace vertical lines to verify lanes align.
- SVG icons or images, never emoji-as-icons.

## Review checklist (run at every checkpoint)

Evaluate each, give a one-line verdict, fix before moving on:

- **Spacing** — uneven gaps, cramped groups, unintentional dead zones; is there rhythm?
- **Typography** — too small to read, poor line-height, weak heading/body/caption hierarchy?
- **Contrast** — low-contrast text, elements blending into background, overly uniform color?
- **Alignment** — cross-component elements that should share a lane but don't; icons/actions drifting across rows?
- **Fit** — content clipped, or a large empty gap at the bottom?
- **Repetition** — grid-like sameness; vary scale, weight, or spacing for interest.

## Content

Use realistic placeholder content — real-sounding names, numbers, and copy. Never lorem ipsum or "Item 1".

For Frappe UI, prefer `frappe-app-dev` and existing `frappe-ui` patterns.
