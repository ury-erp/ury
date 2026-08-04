# Plan: Handle and Display Proper Error Messages on Frappe Validation Errors

**Track**: `sa-pos-validation-errors`
**Owner**: sa-user (swafaalikkal)
**Issue**: [#249 - Generic Error Message Displayed During Payment Instead of Actual Stock Validation Error](https://github.com/ury-erp/ury/issues/249)
**Branch**: `fix/pos-validation-error-messages`
**Status**: Planning

---

## Problem Statement

When a cashier completes a payment in the React POS v2, Frappe backend may raise a `ValidationError` (e.g., insufficient stock in warehouse). The frontend currently displays a generic "There was an error" message instead of the actual human-readable validation message.

### Root Cause

The `frappe-js-sdk` `call.post()` method re-throws a plain object error when the API fails:
```js
throw {
  ...error.response.data,          // includes _server_messages, exc, exc_type
  message: error.response.data.message ?? 'There was an error.',
  exception: error.response.data.exception ?? ''
}
```

The `_server_messages` field in `error.response.data` is a JSON-encoded array of JSON-encoded message objects containing the actual user-facing text from `frappe.throw()` and `frappe.msgprint()`. The `message` field itself may just be `"ValidationError"` or a technical exception string, not the user-readable content.

In `PaymentDialog.tsx`, the catch block reads only `.message`:
```ts
} catch (err) {
  setError((err as Error).message);  // shows 'There was an error.'
}
```

In `OrderPanel.tsx` (order sync), the correct parsing pattern already exists inline but is duplicated. It needs to be extracted into a shared utility.

---

## Solution

### Phase 1: Add Shared Error Parsing Utility in `@ury/core`

Add a `parseFrappeError(err: unknown): string` utility function to `packages/core/src/frappe/errors.ts` and export it from `packages/core/src/index.ts`.

**Parsing priority:**
1. Parse `_server_messages` (JSON array of JSON messages) - primary source of human-readable text from `frappe.throw()`
2. Fall back to `err.message` if not a generic/empty string
3. Fall back to `err.exc_type` stripped to a readable name
4. Fall back to a generic fallback string (i18n key: `errors.server_error`)

**File**: `packages/core/src/frappe/errors.ts`

```ts
/**
 * Parses a Frappe API error object into a human-readable string.
 *
 * When Frappe raises a ValidationError, the actual user-facing message is
 * in `_server_messages` (double-encoded JSON), not in `message`. This utility
 * normalizes all Frappe error shapes into a single string for display.
 */
export function parseFrappeError(err: unknown, fallback = 'An unexpected error occurred.'): string {
  if (!err || typeof err !== 'object') {
    return fallback;
  }

  const e = err as Record<string, unknown>;

  // Primary: _server_messages from frappe.throw() / frappe.msgprint()
  if (typeof e._server_messages === 'string' && e._server_messages) {
    try {
      const messages: string[] = JSON.parse(e._server_messages);
      if (messages.length > 0) {
        const first: { message?: string } = JSON.parse(messages[0]);
        if (first.message) {
          // Strip HTML tags from message (Frappe sometimes wraps in <p>)
          return first.message.replace(/<[^>]*>/g, '').trim();
        }
      }
    } catch {
      // Fall through to next strategy
    }
  }

  // Secondary: message field, if it's not a generic/technical string
  if (typeof e.message === 'string' && e.message && e.message !== 'There was an error.') {
    return e.message;
  }

  // Tertiary: exc_type (e.g. "frappe.exceptions.ValidationError" -> "Validation Error")
  if (typeof e.exc_type === 'string' && e.exc_type) {
    const parts = e.exc_type.split('.');
    const lastPart = parts[parts.length - 1] ?? '';
    // Convert PascalCase to spaced words
    return lastPart.replace(/([A-Z])/g, ' $1').trim();
  }

  return fallback;
}
```

### Phase 2: Fix `PaymentDialog.tsx`

Replace the catch block in `handlePayment()`:
```ts
} catch (err) {
  setError((err as Error).message);  // BEFORE
}
```

With:
```ts
} catch (err) {
  setError(parseFrappeError(err, t('errors.payment_failed')));  // AFTER
}
```

Also add the import at the top:
```ts
import { parseFrappeError } from '@ury/core';
```

### Phase 3: Refactor `OrderPanel.tsx`

Replace the inline `_server_messages` parsing in the catch block with the shared utility:
```ts
// BEFORE (inline parsing)
if (error && typeof error === 'object' && '_server_messages' in error && ...) { ... }

// AFTER
showToast.error(parseFrappeError(error, t('errors.failed_process_order')));
```

### Phase 4: Add i18n Keys

Add the new translation keys to the i18n data files (`pos/src/i18n/`):
- `errors.payment_failed`: "Payment could not be completed. Please try again."
- `errors.server_error`: "An unexpected server error occurred."

---

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/core/src/frappe/errors.ts` | NEW | Shared `parseFrappeError` utility |
| `packages/core/src/index.ts` | MODIFY | Export `parseFrappeError` |
| `pos/src/components/PaymentDialog.tsx` | MODIFY | Use `parseFrappeError` in catch block |
| `pos/src/components/OrderPanel.tsx` | MODIFY | Refactor to use shared `parseFrappeError` |
| `pos/src/i18n/` | MODIFY | Add `errors.payment_failed` and `errors.server_error` keys |

---

## Git Strategy

- Branch: `fix/pos-validation-error-messages` from `develop`
- Commits:
  1. `feat(core): add parseFrappeError utility for consistent error handling`
  2. `fix(pos): display actual Frappe validation messages in PaymentDialog`
  3. `refactor(pos): use shared parseFrappeError in OrderPanel error handling`
  4. `feat(pos/i18n): add payment_failed and server_error translation keys`
- PR target: `develop`

---

## Testing

1. Trigger an insufficient stock error by attempting to pay for an order when stock is 0 in the warehouse.
2. Verify the actual message (e.g. "Stock for Item X in Warehouse Y is insufficient") appears in the payment dialog.
3. Test with other ValidationErrors to ensure the utility handles all cases.
4. Verify the discount error messages in PaymentDialog still work.
5. Verify OrderPanel sync errors still show correctly.
