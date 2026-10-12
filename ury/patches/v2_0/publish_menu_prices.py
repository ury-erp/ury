"""Publish every menu's rates into its price list.

`URY Menu.make_price_list()` only runs on save, so any menu whose rows were
written another way — a setup script, an import, a direct db write — kept its
prices on the document and published none of them. Nothing looked wrong: both
the POS grid and the self-ordering page render `URY Menu Item.rate`, so staff
and customers saw correct prices right up to the moment an order was priced
from `Item Price` and found nothing there.

Found on a live site with 33 priced menu rows and zero Item Price records:
every order on that branch failed to price.

Runs for every menu, not only empty ones, because a partially published list
is the same failure for the dishes it is missing. Publishing is idempotent —
it is the same code the save hook runs.
"""

import frappe


def execute():
    for name in frappe.get_all("URY Menu", pluck="name"):
        try:
            menu = frappe.get_doc("URY Menu", name)
            if not menu.items:
                continue
            menu.make_price_list()
        except Exception:
            # One unpublishable menu must not stop the migration for the rest.
            frappe.log_error(frappe.get_traceback(), f"Could not publish prices for menu {name}")
