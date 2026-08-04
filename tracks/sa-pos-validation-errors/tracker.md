# Tracker: POS Validation Error Messages

**Track**: `sa-pos-validation-errors`
**Issue**: [#249](https://github.com/ury-erp/ury/issues/249)
**Branch**: `fix/pos-validation-error-messages`
**Started**: 2026-07-29

---

## Tasks

- [x] Create feature branch `fix/pos-validation-error-messages` from `develop`
- [x] Add `parseFrappeError` utility to `packages/core/src/frappe/errors.ts`
- [x] Export `parseFrappeError` from `packages/core/src/index.ts`
- [x] Fix `PaymentDialog.tsx` catch block to use `parseFrappeError`
- [x] Fix `PaymentDialog.tsx` dead `window.showToast` success path with proper import
- [x] Add `errors.payment_failed` i18n key to all locale files (en, ar, fr)
- [x] Refactor `OrderPanel.tsx` catch block to use shared `parseFrappeError`
- [x] Fix `Orders.tsx` cancel/edit error handling to use `parseFrappeError`
- [x] Build and verify no TypeScript errors (both @ury/core and pos pass `tsc --noEmit`)
- [x] Production build verified (`yarn workspace pos build` succeeds)
- [ ] Manual test: insufficient stock scenario shows correct message
- [ ] Manual test: other validation errors surface correct messages
- [ ] Manual test: discount errors still display correctly
- [x] Commit changes incrementally per plan (2 commits)
- [ ] Open PR against `develop`

---

## Progress Log

| Date | Event |
|------|-------|
| 2026-07-29 | Track created, plan drafted, research completed |
| 2026-07-29 | Implementation complete. Both TypeScript and production build pass. Branch: `fix/pos-validation-error-messages` |
