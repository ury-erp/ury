# Permissions

## DocType-level permissions

Define in the DocType JSON under `permissions`:

```json
{
    "permissions": [
        {
            "role": "System Manager",
            "read": 1, "write": 1, "create": 1, "delete": 1, "submit": 0, "cancel": 0
        },
        {
            "role": "Expense User",
            "read": 1, "write": 1, "create": 1, "delete": 0
        }
    ]
}
```

Permission levels: `read`, `write`, `create`, `delete`, `submit`, `cancel`, `amend`, `print`, `email`, `share`, `export`, `import`, `report`.

## Custom roles

Create a Role DocType JSON:
```json
{
    "name": "Expense User",
    "doctype": "Role",
    "desk_access": 1,
    "is_custom": 0
}
```

Place at: `apps/<app>/<app>/<module>/role/expense_user/expense_user.json`

Or use fixtures in `hooks.py`:
```python
fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Expense User", "Expense Manager"]]]}
]
```

## Programmatic permission checks

```python
# Check if current user has permission
frappe.has_permission("Expense", "read")
frappe.has_permission("Expense", "write", doc="EXP-0001")

# Throw if no permission
frappe.has_permission("Expense", "write", throw=True)

# Check for specific user
frappe.has_permission("Expense", "read", user="john@example.com")
```

## Bypassing permissions

```python
# Insert without permission checks
doc.insert(ignore_permissions=True)

# flags approach
doc.flags.ignore_permissions = True
doc.save()

# Run as Administrator
frappe.set_user("Administrator")
# ... do work ...
frappe.set_user(original_user)
```

Use `ignore_permissions` only in server-side background logic, never in user-facing APIs.

## User-based filtering (owner permissions)

Add `"if_owner": 1` to a permission rule to restrict users to their own documents:
```json
{
    "role": "Expense User",
    "read": 1, "write": 1,
    "if_owner": 1
}
```

## `has_permission` controller hook

```python
class Expense(Document):
    def has_permission(self, permtype, user=None):
        if permtype == "read" and self.department == get_user_department(user):
            return True
        return False
```

## Row-level filtering on list views (`get_query_conditions`)

To restrict which records appear in list views and `get_list` calls, define `permission_query_conditions` in `hooks.py`:

```python
# hooks.py
permission_query_conditions = {
    "Expense": "myapp.permissions.expense_query_conditions",
}
```

```python
# myapp/permissions.py
import frappe

def expense_query_conditions(user=None):
    if not user:
        user = frappe.session.user
    if "Expense Manager" in frappe.get_roles(user):
        return ""  # no restriction
    return f"`tabExpense`.`owner` = {frappe.db.escape(user)}"
```

Return a SQL WHERE clause fragment (string), or `""` for no restriction. Return `False` to deny all access.

Pair with `has_permission` for complete coverage — `permission_query_conditions` filters lists, `has_permission` guards individual documents.
