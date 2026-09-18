# GitHub Copilot instructions for URY-BRON

Read the repository root `AGENTS.md` for project context and `docs/AI_ENGINEERING_GUIDE.md` for shared engineering standards before proposing or editing code. Read the affected module's `ARCHITECTURE.md` when one exists. This file summarizes the rules that must be present in every Copilot interaction.

## Working method

- Inspect the relevant source, tests, DocType JSON, hooks, API callers, and `git status` before editing.
- Decide whether the reported behavior is a code defect, Frappe/ERPNext configuration issue, or both.
- Make the smallest cohesive change. Preserve unrelated work and existing public contracts.
- Do not rename dotted RPC methods, DocTypes, fieldnames, route paths, stored values, or realtime channels without a coordinated migration.
- Add/update focused tests and report the exact checks run. Never claim unexecuted tests passed.

## Architecture

URY is a Frappe/ERPNext modular monolith:

- `ury/ury_pos/api.py`: compatibility-sensitive legacy POS API. Preserve existing camelCase RPCs; put new independent capabilities in focused `ury/ury/api/` modules.
- `ury/ury/api/`: domain APIs; `ury/ury/report_api/`: protected reports and shared query helpers.
- `ury/ury/doctype/`: DocType schema/controllers and document-owned invariants.
- `ury/ury/hooks/`: extensions to standard ERPNext document lifecycle; keep handlers small.
- `ury/hooks.py`: registration/configuration, not business logic.
- `ury/www/*.py`: boot context/access only, not order/payment/permission logic.
- `pos/`: React cashier/captain POS; `frontend/`: React management/setup/reports; `self-order/`: React QR/kiosk/tablet ordering.
- `packages/core/`: framework-agnostic shared TypeScript; `packages/ui/`: shared React primitives/theme.
- `mosaic/`: Vue KDS; `urypos/`: legacy Vue POS. Do not migrate legacy architecture during unrelated work.

Keep the normal dependency flow:

`view -> app hook/store/service/API wrapper -> @ury/core -> whitelisted Python boundary -> domain/DocType logic -> Frappe ORM`.

Frontend capability checks are UX only; backend authorization is mandatory.

## SOLID, KISS, and DRY

- Give each component, hook, service, endpoint, and helper one primary responsibility.
- Keep whitelisted endpoints thin: normalize input, authorize, validate scope/state, then delegate to testable helpers.
- Extract rules that must evolve together—permissions, payload normalization, query/date logic, provider behavior. Do not abstract merely similar markup.
- Inject volatile integrations such as payment terminals, printers, communication providers, or time behind narrow interfaces when it materially improves tests.
- Prefer explicit inputs/outputs, guard clauses, and Frappe-native APIs over custom frameworks and hidden global state.
- Do not create speculative factories/repositories or refactor unrelated legacy code.
- Split files by business capability when they have multiple reasons to change; do not keep expanding the legacy POS API for unrelated features.

## Naming

Python/Frappe:

- modules, functions, variables, and fieldnames: `lower_snake_case`;
- private helpers: `_leading_underscore`;
- constants: `UPPER_SNAKE_CASE`;
- classes: `PascalCase`;
- new whitelisted methods: verb-led `snake_case`;
- DocType controllers preserve generated acronyms, for example `URYOrderingSession`;
- tests: `TestBehavior.test_expected_behavior`.

Preserve legacy camelCase endpoints such as `getRestaurantMenu`. New custom fields on standard ERPNext DocTypes normally use the Frappe `custom_` prefix unless compatibility explicitly requires an existing legacy convention.

TypeScript/React/Vue:

- components, layouts, types, interfaces: `PascalCase`;
- React component files: `PascalCase.tsx`;
- hooks: `useCamelCase`;
- functions/variables: `camelCase`;
- constants: `UPPER_SNAKE_CASE`;
- domain API modules/store files: descriptive `kebab-case`;
- route segments: `kebab-case`.

Avoid `any`; narrow `unknown` network data or define minimal response types. Reusable exports are normally named exports unless the local page/layout convention is default export.

## Frappe rules

- Prefer ORM, Query Builder, document APIs, and Frappe utilities. Raw SQL is for reports or demonstrated performance needs, must bind all values, and must avoid N+1 access.
- A mutating endpoint must authenticate/authorize, validate inputs, enforce branch/restaurant/POS Profile/document scope, and validate document state.
- Do not add `allow_guest=True` to fix authentication. Public flows require a documented reason and a signed/scoped token or equivalent control.
- Do not add `ignore_permissions=True` to fix a user-facing permission failure. New controlled system uses require explicit authorization and a nearby explanation.
- Do not add broad exception swallowing or manual commits to ordinary request handlers.
- Use `frappe._()` for user-facing backend strings and Frappe type/date helpers.
- Keep migration patches idempotent and list them in `ury/patches.txt`.
- Keep standard-DocType custom field definitions in `ury/setup_customizations.py` consistent with fixture selection in `ury/hooks.py`.

## Permission errors: diagnose Desk before code

Never modify authorization logic merely because a user sees “Not permitted.”

First determine the exact user, DocType/document, operation, API, response, and traceback, then reproduce as that non-Administrator user. Check:

1. User enabled/type, Roles, and Role Profile.
2. Role Permission Manager: DocType, permission level, requested operation, `if_owner`, and workflow permissions.
3. User Permission records for Company, Branch, POS Profile, Restaurant, and linked records, including strict/applicable scope.
4. Branch user/room rows.
5. POS Profile applicable users, billing/restricted/captain-transfer roles, multiple-cashier settings, Restaurant, and Branch.
6. POS Opening Entry, room/cashier ownership, and document status.
7. Migrations, custom fields, patches, and cache.
8. The result of Frappe `has_permission` separately from URY branch/ownership/business restrictions.

If the configured user lacks a role or Desk permission, prefer the least-privilege Desk/configuration fix and explain it. Change code only when the documented business rule says the configured user is allowed and evidence shows the implementation is wrong. Then test at least one allowed and one denied non-Administrator case.

Never remove backend, branch, restaurant, POS Profile, room, owner, or document-state checks; never add a global role bypass for one user's setup problem. `@ury/core` role helpers and React guards are not security boundaries. `ury/permission.py` controls app-screen visibility only.

## Frontend rules

- Keep TypeScript strict; do not weaken lint or compiler settings.
- Put remote calls in app `lib/`, `services/`, or focused hooks—not presentational components.
- Import shared utilities from `@ury/core` and primitives from `@ury/ui`; never deep-import package internals.
- Use `@ury/ui` form controls and semantic theme tokens; avoid new raw controls and arbitrary color literals where shared primitives/tokens exist.
- Keep transient state local, reusable async behavior in hooks/services, and established cross-page state in the existing context/store.
- Handle loading, empty, validation, success, retry, and error states; prevent duplicate financial/order submits.
- POS text changes update `en`, `fr`, and `ar` locale files and preserve RTL.
- Self-ordering never trusts client prices, layout, device, table, invoice, customer, or payment state; never log tokens, credentials, staff PINs, or payment secrets.

## Generated files and secrets

Do not hand-edit:

- `ury/public/pos/` or `ury/www/pos.html`;
- `ury/public/ury/` or `ury/www/ury.html`;
- `ury/public/order/` or `ury/www/order.html`;
- `ury/public/mosaic/` or `ury/www/mosaic.html`;
- `ury/public/urypos/` or `ury/www/urypos.html`.

Never commit credentials, private keys, PINs, QR/session/device tokens, payment secrets, or production data.
