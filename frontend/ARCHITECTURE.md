# URY Management Frontend Architecture

This file documents the React management application served under `/ury`. Repository-wide engineering rules are defined in `../docs/AI_ENGINEERING_GUIDE.md`.

## Architecture

- `src/App.tsx` owns route composition and setup/dashboard guards.
- `src/pages/Setup/` and `src/components/setup/` implement the organization and business configuration wizard.
- `src/context/ConfigureContext.tsx` owns cross-section setup state; section components should not recreate that state.
- `src/pages/Dashboard/` contains management master-data pages and dashboard composition.
- `src/pages/Reports/` contains report pages and `reportsRegistry.ts`; reusable filters/charts live under `src/components/reports/`.
- `src/services/` contains backend calls for setup and dashboard domains.
- `src/lib/` contains focused client utilities such as realtime and report-date behavior.
- `src/data/forms/` and `src/data/schemas/` are declarative setup/form definitions. Keep schema, form rendering, and backend payload names synchronized.
- `src/context/BranchContext.tsx` is the authoritative selected-branch context for branch-aware screens.
- Shared primitives come from `@ury/ui`; shared Frappe/client utilities come from the `@ury/core` barrel.

The production build writes to `../ury/public/ury/` and copies its HTML entry to `../ury/www/ury.html`. Never hand-edit those outputs.

## Rules

- Keep route guards as UX/navigation controls. Every protected report or mutation must still authorize in Python.
- Use `services/` or a focused hook for remote calls; presentational components should not contain dotted Frappe method paths.
- New report endpoints belong in the appropriate `ury/ury/report_api/<domain>.py` module and must call the shared server-side authorization/validation helpers.
- Preserve setup step and payload compatibility. A field rename requires coordinated schema, context, service, backend, and migration changes.
- Reuse `BranchContext`; do not add separate selected-branch state to individual report pages.
- Register a new report once in `reportsRegistry.ts` and reuse shared date filters/chart cards rather than copying page infrastructure.
- Keep TypeScript strict. Define minimal response/domain types and narrow untrusted API data.
- Use `@ury/ui` controls and semantic theme tokens. Do not add new raw form controls or arbitrary color literals when the design system covers the need.
- Keep transient modal/loading state local; put cross-step setup state in `ConfigureContext`; do not introduce a global store without a demonstrated cross-page need.
- Handle loading, empty, partial-data, validation, and error states explicitly. Disable duplicate setup/report mutations while pending.
- Avoid format/helper duplication: cross-report date behavior belongs in `lib/reportDate.ts`; app-only formatting in `utils/`; truly cross-app utilities in `@ury/core`.

## Naming

- Components/pages/types: `PascalCase`; component files: `PascalCase.tsx`.
- Hooks: `useCamelCase`; services/utilities: `camelCase`.
- Declarative JSON fieldnames must match stable Frappe `lower_snake_case` fieldnames exactly.
- Route segments use `kebab-case`; do not rename published routes without redirect/compatibility handling.

## Verification

For frontend changes run:

```sh
yarn workspace frontend typecheck
yarn workspace frontend lint
yarn workspace frontend build
```

For setup/schema changes also test both a fresh setup and a resumed/partially completed setup. For authorization-sensitive pages, verify with the intended non-Administrator role.
