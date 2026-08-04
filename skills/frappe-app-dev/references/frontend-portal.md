# Portal Pages (Public Website)

Server-rendered Jinja templates for public-facing pages.

## Jinja templates

File: `apps/<app>/<app>/www/<page_name>.html`

```html
{% extends "templates/web.html" %}
{% block page_content %}
<h1>Expenses</h1>
{% for expense in expenses %}
<div>{{ expense.title }} — {{ expense.amount }}</div>
{% endfor %}
{% endblock %}
```

Context via Python:
File: `apps/<app>/<app>/www/<page_name>.py`

```python
import frappe

def get_context(context):
    context.expenses = frappe.db.get_all("Expense",
        filters={"owner": frappe.session.user},
        fields=["title", "amount"])
```

## Portal settings

In `hooks.py`:
```python
website_route_rules = [
    {"from_route": "/expenses", "to_route": "Expense"},
]

has_website_permission = {
    "Expense": "myapp.permissions.has_website_permission"
}
```
