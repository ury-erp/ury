# @ury/ui Architecture

This package is the shared React design system used by the React applications. Repository-wide engineering rules are defined in `../../docs/AI_ENGINEERING_GUIDE.md`.

## Boundaries

- Keep `@ury/ui` free of restaurant, order, POS Profile, branch, permission, API, routing, and application-store logic.
- Shared primitives live in `src/components/`; class composition in `src/lib/cn.ts`; semantic tokens in `src/styles/theme.css`; Tailwind mapping in `tailwind-preset.js`.
- Export supported public components from `src/index.ts`. Consumers import from `@ury/ui`, never package-internal paths.
- Do not depend on `@ury/core` or on a consuming application.

## Component design

- Use `PascalCase` symbols with descriptive kebab/lowercase primitive filenames consistent with the existing package.
- Keep props small and composable. Extend native element attributes where appropriate, forward refs when consumers need DOM access, and preserve keyboard/focus/accessibility semantics.
- Prefer controlled/uncontrolled patterns already used by the underlying primitive. Do not hide business state inside a visual component.
- Use semantic CSS variables and Tailwind classes; do not hardcode brand colors in components.
- Merge consumer `className` with `cn()` and avoid styles that cannot be overridden intentionally.
- New variants belong in the component's variant definition or shared theme, not repeated in consumers.
- Avoid adding a dependency for behavior that can be expressed clearly with React and existing primitives. New module-level imports require compatible package metadata and consumer verification.
- A breaking prop/export/style-token change must update every consumer in the same change.

## Verification

Run:

```sh
yarn workspace @ury/ui typecheck
```

Then lint/build every affected React consumer. Visually verify focus, disabled/loading states, keyboard use, responsive behavior, and both LTR and RTL for directional components.
