# URY AI Engineering Guide

This is the common coding standard for GPT/Codex, Claude, GitHub Copilot, and human contributors. Read it before changing source code. Project structure and domain context remain in the root `AGENTS.md`; module details live in each module's `ARCHITECTURE.md`.

## Working Method

1. Read `AGENTS.md`, this guide, and the relevant module `ARCHITECTURE.md`.
2. Inspect implementation, tests, DocType JSON, hooks, API callers, and `git status`.
3. Decide whether the request is a code defect, a Frappe/ERPNext configuration issue, or both.
4. Make the smallest cohesive change that solves the verified requirement and preserves unrelated work.
5. Update tests and documentation when behavior, setup, permissions, or architecture changes.

Repository documentation can lag behind implementation. Source code, DocType metadata, migrations, and tests are the source of truth.

## Architectural Style

Use a pragmatic modular-monolith style:

- Group code by business capability.
- Keep external boundaries thin: normalize input, authorize, validate scope/state, then delegate to testable helpers.
- Put each invariant in one authoritative backend location. Frontend guards are UX controls, not security boundaries.
- Keep DocType lifecycle logic close to the owning DocType. Use focused hooks only to extend standard ERPNext DocTypes.
- Keep dependencies pointing inward: views depend on app services/APIs; domain/shared utilities do not depend on UI.
- Prefer explicit inputs and return values, guard clauses, and Frappe-native APIs over hidden globals and custom frameworks.
- Split a module when it has multiple reasons to change. Do not introduce speculative factories or repositories for trivial behavior.
- Preserve public RPC paths, DocType names, fieldnames, route paths, stored values, and realtime channels unless a coordinated migration is part of the task.

The intended frontend/backend flow is:

`view -> app hook/store/service/API wrapper -> @ury/core -> whitelisted Python boundary -> domain/DocType logic -> Frappe ORM`.

### SOLID, KISS, and DRY

- **Single responsibility:** one primary responsibility per component, hook, service, endpoint, provider, or helper.
- **Open/closed:** add strategies/providers only where real variation exists. Do not create speculative extension systems.
- **Liskov substitution:** implementations preserve documented interface behavior, errors, side effects, and return shapes.
- **Interface segregation:** pass the smallest prop, DTO, and service surface a consumer needs.
- **Dependency inversion:** inject volatile integrations such as payment terminals, printers, communication providers, and time when this materially improves testability.
- **KISS:** choose clear, boring, Frappe-native implementations.
- **DRY:** extract rules that must evolve together—permissions, payload normalization, query/date logic, and provider behavior. Similar markup alone does not justify abstraction.
- Do not use a feature or bug fix to rename, reformat, or rewrite unrelated legacy code.

## Naming Conventions

Preserve existing public names. Apply these rules to new code and code already being changed.

### Python and Frappe

| Item | Convention | Example |
|---|---|---|
| Modules, functions, variables | `lower_snake_case` | `get_payment_status` |
| Private helpers | leading underscore | `_resolve_session` |
| Constants | `UPPER_SNAKE_CASE` | `SUPERVISOR_ROLES` |
| Classes | `PascalCase` | `PaymentTerminalProvider` |
| DocType controller | generated DocType form, preserving acronyms | `URYOrderingSession` |
| New RPC methods | verb-led `snake_case` | `create_payment_request` |
| Tests | `TestBehavior.test_expected_behavior` | `test_invalid_token_is_rejected` |
| Fieldnames | stable `lower_snake_case` | `restaurant_table` |

Do not rename legacy camelCase RPCs such as `getRestaurantMenu`; callers may depend on their dotted paths. New custom fields on standard ERPNext DocTypes normally follow current Frappe `custom_` naming requirements unless compatibility explicitly requires an established URY fieldname.

### TypeScript, React, and Vue

| Item | Convention | Example |
|---|---|---|
| Components, layouts, types, interfaces | `PascalCase` | `PaymentDialog` |
| React component files | `PascalCase.tsx` | `PaymentDialog.tsx` |
| Hooks | `useCamelCase` | `useOrderingSession` |
| Functions and variables | `camelCase` | `createPaymentRequest` |
| Constants | `UPPER_SNAKE_CASE` | `ORDER_TYPES` |
| Domain API/store modules | descriptive `kebab-case` | `pos-opening-api.ts` |
| Routes | `kebab-case` | `report-settings` |

Avoid `any`. Receive network data as `unknown` or a minimal response type and narrow it at the boundary. Prefer named reusable exports unless the local page/layout convention consistently uses default exports.

## Frappe and ERPNext Rules

- Prefer Frappe ORM, Query Builder, document APIs, and framework utilities.
- Use `frappe.get_doc` when controller behavior or document permission checks matter; use focused `frappe.db.get_value`/`get_all` reads otherwise.
- Raw SQL is appropriate for reporting or a demonstrated performance need. Bind every value and never interpolate user input.
- Avoid N+1 queries. Batch fields, select only what is needed, and paginate unbounded lists.
- Let Frappe own ordinary request transactions. Do not add manual commits/rollbacks without a documented transactional reason.
- Do not swallow broad exceptions. Handle only recoverable errors and preserve useful tracebacks/context without secrets.
- Use `frappe._()` for user-facing backend messages and Frappe helpers such as `cint`, `flt`, `getdate`, and `now_datetime`.
- A mutating whitelisted endpoint must validate input, authenticate/authorize, enforce Branch/Restaurant/POS Profile/document scope, and validate document state before writing.
- Treat route values, client payloads, prices, roles, branch/table/invoice names, and device/payment identifiers as untrusted.
- Never add `allow_guest=True` merely to solve authentication. Public flows require a documented reason and signed/scoped authorization or equivalent abuse controls.
- Never add `ignore_permissions=True` to solve a user-facing permission failure. Controlled system/install/migration uses require explicit authorization and a nearby explanation.
- Do not mutate submitted ERPNext documents through direct SQL or `db_set` unless a documented requirement cannot use the supported document lifecycle.

## Permission-First Diagnostic Policy

Permission failures are configuration-first investigations. Do not modify authorization code until the configured user should be allowed by the documented business rule and the existing code still rejects the request.

Required diagnostic order:

1. Capture the exact user, site, route/API, DocType/document, requested operation, response, and traceback.
2. Reproduce as the affected non-Administrator user. Administrator success proves nothing about ordinary permissions.
3. In Frappe Desk inspect User enabled/type status, assigned Roles, and Role Profile.
4. Inspect Role Permission Manager for the exact DocType, permission level, operation (`select/read/write/create/submit/cancel/print`), `if_owner`, and workflow-state permissions.
5. Inspect User Permission records for Company, Branch, POS Profile, Restaurant, and linked records, including strict scope, `Applicable For`, and `Apply To All Document Types`.
6. Inspect URY operational configuration:
   - Branch user/room rows (`URY User`);
   - POS Profile applicable users, billing roles, restricted table-order roles, captain-transfer roles, multiple-cashier flags, Restaurant, and Branch;
   - active POS Opening Entry, assigned room, cashier ownership, and document status.
7. Confirm migrations, custom fields, and patches ran and cache/session state is current.
8. Evaluate `frappe.has_permission` separately from URY branch, room, ownership, and business-rule checks. Identify the exact denying layer.
9. If a role or permission is missing, prefer the least-privilege Frappe Desk/configuration fix and report it. Do not create a code diff simply to make “Not permitted” disappear.
10. Change code only with evidence of an incorrect or missing business rule. Add one allowed and one denied non-Administrator test.

Permission invariants:

- Never weaken backend authorization because a frontend guard hides an action.
- Never broaden global access for one user's missing role or User Permission.
- Never remove Branch, Restaurant, POS Profile, Room, owner, or document-state scope as a shortcut.
- Never add Administrator/System Manager bypasses without an explicit product requirement.
- `@ury/core` capability helpers and React `RoleGuard`/`AuthGuard` are UX controls, not security boundaries.
- `ury/permission.py` controls app-screen visibility only.
- `ury/role_permissions.py`, fixtures, and patches provide provisioning defaults. A live site's Desk configuration can differ and must be inspected first.

## Schema, Fixtures, and Migrations

- Change a URY DocType's controller/JSON in its own directory and include a migration when existing data needs transformation.
- Keep standard-DocType custom field definitions in `ury/setup_customizations.py` consistent with fixture selection in `ury/hooks.py`.
- Do not hand-edit exported fixture data merely to imitate a Desk change. Use the supported Frappe export/setup flow unless the task explicitly concerns fixture source.
- Migration patches must be idempotent, safe on partially configured sites, and registered once in `ury/patches.txt` under the correct phase.
- Never assume a field exists on upgraded sites until migration ordering guarantees it.
- Do not silently swallow install/migration failures.
- A schema rename requires an explicit migration plus coordinated backend/frontend updates.

## Frontend Rules

- Keep TypeScript strict; do not weaken compiler or lint settings.
- Keep remote calls in app `lib/`, `services/`, or focused hooks, not presentational components.
- Import shared utilities/components only from the `@ury/core` and `@ury/ui` public barrels.
- Use `@ury/ui` primitives and semantic theme tokens rather than new raw form controls or arbitrary colors where a shared solution exists.
- Keep transient UI state local and use established context/store boundaries for shared state. Do not store derived values.
- Preserve loading, empty, validation, success, retry, and error states. Prevent duplicate order/payment/setup mutations.
- POS user-facing text changes update `en`, `fr`, and `ar` locales and preserve RTL behavior.
- Keep `mosaic/` and `urypos/` in their established Vue Options API style during unrelated changes.
- QZ keys, credentials, tokens, PINs, and production secrets must never enter shared packages or version control.

### Self-ordering security

- The server owns price, layout/device eligibility, table assignment, session validity, invoice/customer scope, and payment state.
- Never log or expose QR/session/device credentials, staff PINs, payment links, or transaction secrets.
- Keep customer responses sanitized; never expose unrestricted POS Invoice, Customer, or payment documents.
- Protect item, bill-request, and payment mutations against duplicate actions/replay where applicable.
- Idle reset must not leak one customer's session/cart to the next user.

## Performance and Reliability

- Avoid per-row database calls on POS boot, menu, order list, KDS, and report hot paths.
- Validate date ranges, pagination, and page sizes server-side.
- Keep network payloads minimal and do not return entire documents without need.
- Preserve transaction semantics across order, invoice, payment, KOT, and table-state changes.
- Realtime names and payloads are contracts; change publishers and every subscriber together.
- Log operational context without passwords, PINs, tokens, private keys, or payment secrets.

## Testing and Completion

- Add/update a nearby `test_*.py` for backend business rules, permissions, document lifecycle, and endpoints.
- Use `FrappeTestCase` for Frappe integration behavior and ordinary unit tests for pure helpers/providers.
- Permission changes require allowed and denied non-Administrator coverage.
- Run targeted bench tests, for example `bench --site <site> run-tests --app ury --module <module>`.
- Run Ruff on changed Python files according to `pyproject.toml`.
- React changes require affected workspace typecheck/lint/build.
- `@ury/core` and `@ury/ui` changes require verification of every affected consumer.
- Vue changes require the affected production build and manual realtime/reconnect verification when relevant.
- Do not claim tests passed unless they ran. Report unavailable bench/site/hardware/printer/terminal dependencies explicitly.
- Before handing off, state what changed, what was verified, and what was not run.
