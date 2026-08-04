# Whitelisted APIs

## Preferred: Methods in DocType controllers

Place whitelisted methods in the controller file — either as Document class methods (doc-level) or as module-level functions (doctype-level). This avoids needing full dotted paths to call them.

### Doc-level methods (on a specific document)

```python
# apps/<app>/<app>/<module>/doctype/expense/expense.py

import frappe
from frappe.model.document import Document

class Expense(Document):
    @frappe.whitelist()
    def approve(self):
        self.status = "Approved"
        self.save()
        return self.status
```

Call from client JS:
```javascript
frappe.call({
    method: "approve",       // just the method name
    doc: frm.doc,
    callback(r) { console.log(r.message); }
});
// or
frm.call("approve");
```

Call from HTTP (v2 API):
```
POST /api/v2/document/Expense/EXP-0001/method/approve
```

### DocType-level functions (module root)

```python
# apps/<app>/<app>/<module>/doctype/expense/expense.py

import frappe

@frappe.whitelist()
def get_expense_summary(status=None):
    filters = {"status": status} if status else {}
    return frappe.db.get_all("Expense", filters=filters, fields=["name", "title", "amount"])
```

Call from client JS:
```javascript
frappe.call({
    method: "myapp.mymodule.doctype.expense.expense.get_expense_summary",
    args: { status: "Draft" },
    callback(r) { console.log(r.message); }
});
```

Call from HTTP:
```
POST /api/v2/method/Expense/get_expense_summary
```

## Standalone API files (for non-DocType logic)

Use only when logic doesn't belong to any DocType:

```python
# apps/<app>/<app>/api.py
import frappe

@frappe.whitelist()
def get_dashboard_data():
    return {"total": frappe.db.count("Expense")}
```

For larger apps, organize by feature:
```
apps/<app>/<app>/api/
    __init__.py
    expenses.py
    reports.py
```

## Allow guest access

```python
@frappe.whitelist(allow_guest=True)
def public_endpoint():
    return {"message": "Hello"}
```

Without `allow_guest=True`, the endpoint requires authentication.

## Argument handling

- **Always add type hints** to whitelisted method parameters. Frappe validates and casts arguments based on type hints, preventing type-confusion attacks:
```python
@frappe.whitelist()
def create_expense(title: str, amount: float, tags: list | None = None):
    # title is guaranteed to be str, amount is cast to float
    # Without type hints, all args arrive as untrusted strings
    ...
```

- Use `frappe.form_dict` for raw request data:
```python
data = frappe.form_dict
```

## Return values

- Return a dict/list → auto-serialized to JSON under `{"message": <return_value>}`
- For custom HTTP responses:
```python
frappe.response["meta"] = meta
```

## Built-in document APIs (v2)

Frappe provides CRUD APIs automatically via `/api/v2/document/` — no need to write them. Requires **Frappe v15+**.

```
GET    /api/v2/document/<DocType>                          # list (with filters, fields, order_by, limit)
POST   /api/v2/document/<DocType>                          # create
GET    /api/v2/document/<DocType>/<name>/                  # read
PUT    /api/v2/document/<DocType>/<name>/                  # update
DELETE /api/v2/document/<DocType>/<name>/                  # delete
GET    /api/v2/document/<DocType>/<name>/copy              # copy doc
POST   /api/v2/document/<DocType>/<name>/method/<method>/  # call doc method
POST   /api/v2/method/<DocType>/<method>                   # call doctype level method
GET    /api/v2/doctype/<DocType>/meta                      # get DocType meta
GET    /api/v2/doctype/<DocType>/count                     # count records
```

### List query params
`fields` (JSON list), `filters` (JSON dict/list), `order_by`, `start`, `limit` (default 20), `group_by`.

Response includes `has_next_page` boolean for pagination.

### Bulk operations
```
POST /api/v2/document/<DocType>/bulk_delete   # body: {"names": [...]}
POST /api/v2/document/<DocType>/bulk_update   # body: {"docs": [{"name": "...", ...fields}]}
```

Large bulk operations (>20 items by default) are automatically enqueued as background jobs.

Only create custom `@frappe.whitelist()` endpoints for logic that goes beyond CRUD.

## Specify HTTP methods

Always declare allowed HTTP methods explicitly. Frappe auto-commits only for POST/PUT — GET requests do not commit.

```python
@frappe.whitelist(methods=["GET"])
def get_dashboard_data(): ...

@frappe.whitelist(methods=["POST"])
def submit_entry(name: str): ...

@frappe.whitelist(methods=["GET", "POST"])
def get_or_create_token(): ...
```

## Anti-patterns

- **Don't wrap doc methods in standalone APIs.** If the controller has `@frappe.whitelist()` on a method, clients call it directly via `frm.call("approve")` or `POST /api/v2/document/Expense/EXP-001/method/approve`. Don't create a separate `api.py` function that just fetches the doc and calls the same method.
- **Don't put doc-scoped logic in standalone APIs.** If the function fetches one doc, validates the caller, and acts on that doc — it belongs as a doc-level `@frappe.whitelist()` method, not in `api/`. Reserve standalone APIs for cross-document operations, aggregations, or endpoints with no document context.
- **Don't leak sensitive fields in guest APIs.** With `allow_guest=True`, only return fields guests need. Never expose `user` (email), internal IDs, or permission-sensitive data.
