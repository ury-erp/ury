# URY Self-Ordering Frontend Architecture

This file documents the React self-ordering application served under `/order`. Repository-wide engineering and security rules are defined in `../docs/AI_ENGINEERING_GUIDE.md`.

## Architecture

- `src/App.tsx` selects the server-approved device layout. It must not infer device permissions or layout from screen size alone.
- `src/hooks/useDeviceBootstrap.ts` restores provisioned device context.
- `src/hooks/useOrderingSession.ts` owns QR/session bootstrap and ordering operations.
- `src/hooks/useIdleReset.ts` owns kiosk/tablet idle cleanup.
- `src/lib/api.ts` is the only app API boundary for `ury.ury.api.self_ordering`.
- `src/layouts/` contains device-specific shells; reusable cart/menu UI stays in `src/layouts/shared/`.
- The backend `ury/ury/api/self_ordering.py` is authoritative for sessions, devices, tables, prices, invoice scope, service requests, and payments.

The production build writes to `../ury/public/order/` and copies its HTML entry to `../ury/www/order.html`. Never hand-edit those outputs.

## Security invariants

- Treat QR tokens, session tokens, device IDs/credentials, staff PINs, payment links, and transaction IDs as sensitive. Never log them or include them in user-facing diagnostics.
- Never trust client-supplied price, total, branch, POS Profile, table, layout, invoice, customer, or payment state.
- Keep API responses customer-scoped and sanitized; never expose arbitrary POS Invoice or Customer documents.
- Do not convert a protected endpoint to `allow_guest=True` to solve a session problem. Public entry points require signed/scoped tokens and server-side validation.
- Prevent duplicate item, bill-request, and payment actions while pending. Backend mutations must also protect against replay or duplicate state transitions where needed.
- Idle reset must clear only established self-order credentials/session state and must not leak one customer's cart/session to the next user.

## UI and state rules

- Put API calls in `lib/api.ts`; orchestration and lifecycle in hooks; layouts focus on rendering and interaction.
- Keep shared behavior in hooks/shared layout components rather than copying it across kiosk, tablet, and mobile variants.
- Layout-specific interaction may remain local when devices genuinely differ. DRY does not mean forcing all layouts into a conditional mega-component.
- Use `@ury/ui` and semantic theme tokens. Maintain touch targets, kiosk readability, loading/error recovery, and offline/retry behavior.
- Keep TypeScript strict and use minimal typed response shapes. Narrow network data at the API boundary.
- Preserve server-returned `OrderingLayout` values and source values; they are persisted/public contracts.

## Naming and verification

- Components/layouts/types: `PascalCase`; hooks: `useCamelCase`; functions/variables: `camelCase`; constants: `UPPER_SNAKE_CASE`.
- Run `yarn workspace self-order lint` and `yarn workspace self-order build`.
- For API contract changes, run the targeted tests in `ury/ury/api/test_self_ordering.py` and manually verify QR mobile plus every affected provisioned-device layout.
- Test permission/session failures with a non-Administrator identity and test duplicate/retry behavior for mutations.
