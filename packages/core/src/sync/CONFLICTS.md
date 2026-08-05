# URY POS Conflict Resolution Rules & Strategies Specification

## 1. Overview & Strategy Matrix

During offline operation, cashier transactions are queued in local IndexedDB stores. When connectivity is restored, the **Sync Engine** replays these commands against the server.

If server state has changed in the interim (e.g. another cashier seated a table or an order was paid on another terminal), the **Conflict Resolver** (`ConflictResolver`) intercepts the error, classifies the scenario, and executes one of five **Resolution Strategies**:

| Strategy | Behavioral Description |
|---|---|
| **AUTOMATIC** | Programmatically auto-reconciles the local command (e.g., converts occupied table order to Unassigned Takeaway, re-links IDs). |
| **MANUAL** | Flags command for manual cashier resolution in the UI via modal / toast prompt. |
| **RETRY** | Re-evaluates prerequisite conditions (e.g. session authentication) and reschedules command execution with backoff. |
| **ROLLBACK** | Reverts optimistic local changes in IndexedDB and marks command as FAILED. |
| **IGNORE** | Idempotently marks command as COMPLETED when the server already reflects the desired outcome (e.g. duplicate payment). |

---

## 2. Eleven Conflict Rules & Operational Documentation

### Rule 1: `TABLE_OCCUPIED`
- **Trigger Scenario**: Cashier created/assigned an order to a table offline, but another terminal seated customers at that table before reconnection.
- **Server Error Signature**: `"already occupied"`, `"Table occupied"`, `"is already occupied"`.
- **Strategy**: **AUTOMATIC**
- **Recovery Action**: Detaches order from occupied table, changes `order_type = 'Takeaway'`, clears table reference in local IndexedDB orders repository, and resubmits order as an Unassigned Takeaway Draft so the sale is preserved.

---

### Rule 2: `INVOICE_DELETED`
- **Trigger Scenario**: Cashier updated or paid a draft order offline that was deleted on the server by an administrator.
- **Server Error Signature**: `"DoesNotExistError"`, `"Invoice not found"`, `"POS Invoice ... not found"`.
- **Strategy**: **ROLLBACK**
- **Recovery Action**: Removes deleted draft from local IndexedDB orders repository, marks queued command as `FAILED`, and notifies cashier.

---

### Rule 3: `INVOICE_ALREADY_PAID`
- **Trigger Scenario**: Offline payment or modification attempted on an order that was already settled on another terminal.
- **Server Error Signature**: `"Invoice Already Billed"`, `"already billed"`, `"already paid"`.
- **Strategy**: **IGNORE** (Payment) / **ROLLBACK** (Draft Edit)
- **Recovery Action**: Updates local order status to `'Paid'` in IndexedDB, emits `ORDERS_UPDATED` projection event, and marks command as `COMPLETED`.

---

### Rule 4: `MERGE_FAILED`
- **Trigger Scenario**: Table merge requested offline, but target table became occupied or unmergeable on server.
- **Server Error Signature**: `"Cannot merge"`, `"Occupied tables cannot be merged"`, `"already merged"`.
- **Strategy**: **ROLLBACK**
- **Recovery Action**: Reverts table `merged_with` pointer in local IndexedDB tables repository and notifies cashier.

---

### Rule 5: `SPLIT_FAILED`
- **Trigger Scenario**: Offline bill split requested for items that were modified or deleted on server.
- **Server Error Signature**: `"Cannot split"`, `"Split bill failed"`, `"Invalid items to move"`.
- **Strategy**: **MANUAL**
- **Recovery Action**: Flags transaction in UI for cashier review.

---

### Rule 6: `PAYMENT_DUPLICATED`
- **Trigger Scenario**: Payment entry submitted offline for an invoice that already registered payment on server.
- **Server Error Signature**: `"Payment Entry already exists"`, `"Duplicate payment"`, `"Payment already submitted"`.
- **Strategy**: **IGNORE**
- **Recovery Action**: Idempotently marks command `COMPLETED` and updates local order status to `'Paid'`.

---

### Rule 7: `PERMISSION_CHANGED`
- **Trigger Scenario**: Cashier user role permissions (e.g. table billing or discount permission) revoked while offline.
- **Server Error Signature**: `"PermissionError"`, `"Not permitted"`, `"Not allowed for billing"`.
- **Strategy**: **MANUAL**
- **Recovery Action**: Prompts cashier for admin credential authorization in UI.

---

### Rule 8: `SESSION_EXPIRED`
- **Trigger Scenario**: Frappe session cookie expired or POS Opening Entry closed during offline period.
- **Server Error Signature**: `"SessionExpired"`, `"Please log in"`, `"User is not associated"`.
- **Strategy**: **RETRY**
- **Recovery Action**: Re-authenticates session and reschedules queued command execution.

---

### Rule 9: `MENU_UPDATED`
- **Trigger Scenario**: Item price or course updated on server while offline draft was created.
- **Server Error Signature**: `"Item price changed"`, `"Item disabled"`, `"active menu"`.
- **Strategy**: **AUTOMATIC**
- **Recovery Action**: Re-fetches menu rates, recalculates local order total, and re-submits.

---

### Rule 10: `CUSTOMER_DELETED`
- **Trigger Scenario**: Assigned customer master record deleted on server while offline.
- **Server Error Signature**: `"Customer not found"`, `"Customer deleted"`.
- **Strategy**: **AUTOMATIC**
- **Recovery Action**: Fallbacks customer reference to `'Guest'` / `'Walk-in Customer'` and resubmits.

---

### Rule 11: `ROLE_CHANGED`
- **Trigger Scenario**: User role modified on server while terminal was offline.
- **Server Error Signature**: `"Role changed"`, `"Role updated"`.
- **Strategy**: **MANUAL**
- **Recovery Action**: Prompts cashier to refresh user session roles.
