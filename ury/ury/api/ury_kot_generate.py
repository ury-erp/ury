import json
from collections import defaultdict

import frappe
from frappe.utils import flt

from ury.ury.api.ury_kot_routing import resolve_production_units
from ury.ury.api.ury_production_context import resolve_production_context
# Reuse the reservation service's stable per-line key derivation instead of
# inventing a second concept. `_line_ref` prefers an explicit client-supplied
# identifier (reservation_line_key/name/etc.); `_line_context` falls back to
# comment/course/etc.; `_line_key` combines either with an occurrence counter
# so two lines of the same item_code never collapse into one key. See
# sa-architecture-closure: cancellation/KOT-delta matching previously used
# bare item_code, so the same item on two lines (different comments,
# courses, or a plain duplicate) could have the wrong line cancelled.
from ury.ury.api.ury_order_reservation_service import _line_context, _line_key, _line_ref


# Load JSON data or return as is if it's already a Python dictionary
def load_json(data):
    if isinstance(data, str):
        return json.loads(data)
    return data


# Create a list of order items from a list of input items
def create_order_items(items):
    order_items = []
    for item in items:
        order_item = {
            "item_code": item.get("item", item.get("item_code")),
            "qty": item["qty"],
            "item_name": item["item_name"],
            "comments": item.get("comment", item.get("comments", "")),
            # Preserve the stable per-line key when the caller has already
            # computed one (see _line_keyed_items below) so it survives the
            # trip through KOT item creation instead of being dropped.
            "reservation_line_key": item.get("reservation_line_key"),
        }
        order_items.append(order_item)
    return order_items


def _line_keyed_items(items):
    """Group raw order-item dicts (as sent by the POS client, or the
    past_item snapshot built by sync_order) by a stable per-line key instead
    of collapsing same-item lines by item_code.

    Returns an ordered dict: line_key -> {item_code, item_name, qty
    (aggregated), comments, reservation_line_key}. Ordering follows first
    appearance so callers can diff two calls (previous vs current) made on
    lists that are otherwise in the same relative order.
    """
    seen = defaultdict(int)
    result = {}
    for row in items or []:
        item_code = row.get("item") or row.get("item_code")
        if not item_code:
            continue
        base_context = _line_ref(row) or json.dumps(
            _line_context(row), sort_keys=True, default=str
        )
        occurrence_base = "{0}:{1}".format(item_code, base_context)
        seen[occurrence_base] += 1
        key = _line_key(item_code, row, seen[occurrence_base])
        if key not in result:
            result[key] = {
                "reservation_line_key": key,
                "item_code": item_code,
                "item_name": row.get("item_name"),
                "qty": 0,
                "comments": row.get("comment", row.get("comments", "")),
            }
        result[key]["qty"] = flt(result[key]["qty"]) + flt(row.get("qty"))
    return result


# Create a KOT (Kitchen Order Ticket) document
def create_kot_doc(
    invoice_id,
    customer,
    restaurant_table,
    items,
    kot_type,
    comments,
    pos_profile_id,
    kot_naming_series,
    production,
    validation_dedup_key=None,
):
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    order_number = pos_invoice.custom_ury_order_number
    is_aggregator = 0
    if pos_invoice.order_type == "Aggregators":
        is_aggregator = 1
    kot_doc = frappe.get_doc(
        {
            "doctype": "URY KOT",
            "invoice": invoice_id,
            "restaurant_table": restaurant_table,
            "custom_merged_tables": pos_invoice.get("custom_merged_tables"),
            "customer_name": customer,
            "pos_profile": pos_profile_id,
            "comments": comments,
            "type": kot_type,
            "naming_series": kot_naming_series,
            "production": production,
            "aggregator_id":pos_invoice.custom_aggregator_id,
            "is_aggregator":is_aggregator,
            "order_no":order_number
        }
    )
    if validation_dedup_key:
        # Populates the same "<invoice>::<production>" key the scheduler's
        # create_kot() fallback (ury_kot_validation.py) writes for its own
        # first-KOT-for-this-invoice+production case. Both writers now
        # compete on the same unique index, so a real check-then-insert race
        # between the live path and the scheduler tick is caught at the DB
        # level instead of silently duplicating. Only the first ("New
        # Order") KOT for an invoice+production carries this key -- later,
        # legitimate KOTs for the same invoice+production (Order Modified,
        # etc.) must not collide with it, so callers only pass this for that
        # first-KOT case.
        kot_doc.validation_dedup_key = validation_dedup_key
    if restaurant_table:
        room = frappe.db.get_value("URY Table", restaurant_table, "restaurant_room")
        restaurant = frappe.db.get_value("URY Table", restaurant_table, "restaurant")
        menu = frappe.db.get_value("Menu for Room", {"room": room,"parent":restaurant}, "menu")

    else:
        # No-table orders (Takeaway/Delivery/Aggregators/QR-pickup) have no
        # session-branch-independent context of their own -- the invoice
        # being ticketed is the only reliable source of branch. Using
        # getBranch() here derives the menu from the ACTING USER's session
        # branch instead of the invoice's own branch, which is wrong
        # whenever those differ (e.g. a billing/back-office user operating
        # across branches). Same bug class as PR #373 bug #1
        # (_resolve_or_create_pos_invoice not setting invoice.branch).
        menu = frappe.db.get_value("URY Restaurant", {"branch": pos_invoice.branch}, "active_menu")

    for item in items:
        course = frappe.db.get_value("URY Menu Item", {"item": item["item_code"],"parent":menu}, "course")
        kot_doc.append(
            "kot_items",
            {
                "item": item["item_code"],
                "item_name": item["item_name"],
                "quantity": item["qty"],
                "comments": item["comments"],
                "course":course,
                "reservation_line_key": item.get("reservation_line_key"),
            },
        )
    kot_doc.insert()
    kot_doc.submit()
    return kot_doc.name

# Function to get all production item groups for a given branch
def get_all_production_item_groups(branch):
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": branch}, fields=["name"]
    )
    if productions:
        all_production_item_groups = set()
        for production in productions:
            productionItemGroupslist = frappe.get_all(
                "URY Production Item Groups",
                fields=["item_group"],
                filters={
                    "parent": production.name,
                    "parenttype": "URY Production Unit",
                },
                order_by="idx",
            )
            productionItemGroups = [
                item_group.item_group for item_group in productionItemGroupslist
            ]
            all_production_item_groups.update(productionItemGroups)
        return all_production_item_groups


# Process items to create KOT documents
def process_items_for_kot(
    invoice_id,
    customer,
    restaurant_table,
    items,
    comments,
    pos_profile_id,
    kot_naming_series,
    kot_type,
):
    kot_items = create_order_items(items)
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)

    created_kot_names = []

    # Verify production units exist for the branch
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": pos_profile.branch}, fields=["name"]
    )
    if not productions:
        frappe.throw(
            "Create URY Production unit against POS Profile: %s " % pos_profile.name
        )

    # Build a map of production unit -> items for that unit using the unified resolver
    production_items_map = {}
    for item in kot_items:
        item_code = item["item_code"]
        # Resolve this item's configured production_policy (if any) so
        # DIRECT_RETAIL items -- which have no production routing
        # requirement -- are correctly exempted from routing instead of
        # being silently forced through the legacy item-group fallback.
        production_config = resolve_production_context(
            item_code, pos_profile.branch, company=pos_invoice.company
        )
        production_policy = production_config.production_policy if production_config else None

        # Resolve production units for this item using the unified routing
        # logic. A RoutingError here means a controlled item's routing is
        # missing/ambiguous/disabled -- that must fail the whole KOT batch
        # closed (not be silently skipped) so a customer is never charged
        # for an item the kitchen never sees. See sa-post-373-review-fixes
        # Blocker 2. DIRECT_RETAIL items never raise here (see
        # resolve_production_units); they simply resolve to no production
        # unit.
        resolved_units = resolve_production_units(
            item_code=item_code,
            company=pos_invoice.company,
            branch=pos_profile.branch,
            production_policy=production_policy,
        )
        for production_unit in resolved_units:
            if production_unit not in production_items_map:
                production_items_map[production_unit] = []
            production_items_map[production_unit].append(item)

    # Print warning if any item was not routed (legacy behavior)
    all_routed_items = set()
    for items_list in production_items_map.values():
        for item in items_list:
            all_routed_items.add(item["item_code"])
    for item in kot_items:
        if item["item_code"] not in all_routed_items:
            item_group = frappe.db.get_value("Item", item["item_code"], "item_group")
            frappe.msgprint(
                f"Item group '{item_group}' for item '{item['item_code']}' is not in any production."
            )

    # Create one KOT per production unit
    for production_unit, production_items in production_items_map.items():
        invoice_exist = frappe.db.exists(
            "URY KOT",
            {
                "invoice": invoice_id,
                "docstatus": 1,
                "production": production_unit,
            },
        )
        # This is the same "no KOT exists yet for this invoice+production" case
        # the scheduler's create_kot() fallback guards against with validation_dedup_key --
        # only tag the first ("New Order") KOT here, never the subsequent legitimate ones
        # (Order Modified etc.), so later KOTs for the same invoice+production are not
        # rejected by the unique index.
        validation_dedup_key = None
        current_kot_type = kot_type
        if invoice_exist:
            current_kot_type = "Order Modified"
        else:
            validation_dedup_key = "{0}::{1}".format(invoice_id, production_unit)

        kot_name = create_kot_doc(
            invoice_id,
            customer,
            restaurant_table,
            production_items,
            current_kot_type,
            comments,
            pos_profile_id,
            kot_naming_series,
            production_unit,
            validation_dedup_key=validation_dedup_key,
        )
        created_kot_names.append(kot_name)

    return created_kot_names


# Process items to create a cancel KOT document
def process_items_for_cancel_kot(
    invoice_id,
    customer,
    restaurant_table,
    items,
    comments,
    pos_profile_id,
    cancel_kot_naming_series,
    kot_type,
    invoiceItems,
):

    kot_items = create_order_items(items)
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)

    created_kot_names = []

    # Build a map of production unit -> items for that unit using the unified resolver
    production_items_map = {}
    for item in kot_items:
        item_code = item["item_code"]
        # See process_items_for_kot() above for why production_policy is
        # resolved and why a RoutingError is left to propagate.
        production_config = resolve_production_context(
            item_code, pos_profile.branch, company=pos_invoice.company
        )
        production_policy = production_config.production_policy if production_config else None

        resolved_units = resolve_production_units(
            item_code=item_code,
            company=pos_invoice.company,
            branch=pos_profile.branch,
            production_policy=production_policy,
        )
        for production_unit in resolved_units:
            if production_unit not in production_items_map:
                production_items_map[production_unit] = []
            production_items_map[production_unit].append(item)

    # Create one cancel KOT per production unit
    for production_unit, production_items in production_items_map.items():
        kot_name = create_cancel_kot_doc(
            invoice_id,
            restaurant_table,
            production_items,
            kot_type,
            customer,
            comments,
            pos_profile_id,
            cancel_kot_naming_series,
            invoiceItems,
            production_unit,
        )
        created_kot_names.append(kot_name)

    return created_kot_names


# Create a cancel KOT document
def create_cancel_kot_doc(
    invoice_id,
    restaurant_table,
    cancel_items,
    kot_type,
    customer,
    comments,
    pos_profile_id,
    cancel_kot_naming_series,
    invoiceItems,
    production,
):
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    order_number = pos_invoice.custom_ury_order_number  
    is_aggregator = 0
    if pos_invoice.order_type == "Aggregators":
        is_aggregator = 1
    kot_list = frappe.db.get_list(
        "URY KOT",
        filters={
            "invoice": invoice_id,
            "type": ("in", ("New Order", "Order Modified")),
        },
        fields=("name"),
    )

    # Find original KOTs related to the cancel items. When the cancel item
    # carries a stable reservation_line_key, match ONLY the KOT line that
    # was tagged with that exact key -- this is what lets two identical
    # item_code lines (different comments/courses, or a plain duplicate) be
    # told apart. Fall back to the legacy item_code match only when no line
    # key is available on either side (older/aggregator payloads).
    original_kots = []
    for cancelItem in cancel_items:
        cancel_line_key = cancelItem.get("reservation_line_key")
        for kot in kot_list:
            kot_doc = frappe.get_doc("URY KOT", kot.name)
            kot_cancel_items = kot_doc.kot_items
            itemCheckFlag = False
            for kotItem in kot_cancel_items:
                if cancel_line_key and kotItem.get("reservation_line_key"):
                    if cancel_line_key == kotItem.get("reservation_line_key"):
                        itemCheckFlag = True
                elif cancelItem["item_code"] == kotItem.item:
                    itemCheckFlag = True
            if itemCheckFlag:
                original_kots.append(kot_doc.name)
                break

    # Remove duplicate KOT names and join them into a single string
    set_kots = [*set(original_kots)]
    set_kots = ",".join(set_kots)
    kot_cancel_doc = frappe.get_doc(
        {
            "doctype": "URY KOT",
            "naming_series": cancel_kot_naming_series,
            "original_kot": set_kots,
            "restaurant_table": restaurant_table,
            "customer_name": customer,
            "type": kot_type,
            "invoice": invoice_id,
            "pos_profile": pos_profile_id,
            "comments": comments,
            "production": production,
            "is_aggregator":is_aggregator,
            "order_no":order_number
        }
    )

    if restaurant_table:
        room = frappe.db.get_value("URY Table", restaurant_table, "restaurant_room")
        restaurant = frappe.db.get_value("URY Table", restaurant_table, "restaurant")
        menu = frappe.db.get_value("Menu for Room", {"room": room,"parent":restaurant}, "menu")

    else:
        # No-table cancel KOTs must derive branch from the invoice being
        # cancelled, not from the acting user's session (getBranch()) --
        # same bug class as PR #373 bug #1 and the create_kot_doc() fix
        # above. Using the session branch picks the wrong branch's active
        # menu (and therefore the wrong course grouping) whenever the
        # cancelling user's session branch differs from the invoice's own
        # branch.
        menu = frappe.db.get_value("URY Restaurant", {"branch": pos_invoice.branch}, "active_menu")
    for cancelItem in cancel_items:
        course = frappe.db.get_value("URY Menu Item", {"item": cancelItem["item_code"],"parent":menu}, "course")
        cancel_line_key = cancelItem.get("reservation_line_key")
        # Resolve the single invoice line this cancellation belongs to.
        # Matching by reservation_line_key when available prevents this
        # from appending a cancel row (and picking up the wrong quantity)
        # for EVERY invoice line that shares the same item_code -- the
        # previous behaviour had no `break`, so two lines of the same item
        # produced duplicate/incorrect cancel entries.
        matched_item = None
        if cancel_line_key:
            for item in invoiceItems:
                if item.get("reservation_line_key") == cancel_line_key:
                    matched_item = item
                    break
        if matched_item is None:
            for item in invoiceItems:
                if cancelItem["item_code"] == item["item_code"]:
                    matched_item = item
                    break
        if matched_item is None:
            continue
        kot_cancel_doc.append(
            "kot_items",
            {
                "item": cancelItem["item_code"],
                "item_name": cancelItem["item_name"],
                "cancelled_qty": abs(int(cancelItem["qty"])),
                "quantity": matched_item["qty"],
                "comments": cancelItem["comments"],
                "course":course,
                "reservation_line_key": cancel_line_key,
            },
        )

    kot_cancel_doc.insert()
    kot_cancel_doc.submit()
    return kot_cancel_doc.name


# Whitelisted function to handle KOT entry
@frappe.whitelist()
def kot_execute(
    invoice_id,
    customer,
    restaurant_table=None,
    current_items=[],
    previous_items=[],
    comments=None,
):
    from frappe import _

    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    if not frappe.has_permission("POS Invoice", "write", doc=pos_invoice):
        frappe.throw(_("Not permitted to execute KOT for this invoice"), frappe.PermissionError)

    current_items = load_json(current_items)
    previous_items = load_json(previous_items)

    # Diff current vs previous items PER STABLE LINE (see _line_keyed_items),
    # not per item_code. Two lines of the same item_code (different
    # comments/courses, or a plain duplicate) are now tracked as distinct
    # lines, so a qty change/removal on one line can never be attributed to
    # the other. See sa-architecture-closure.
    current_lines = _line_keyed_items(current_items)
    previous_lines = _line_keyed_items(previous_items)

    positive_qty_items = []
    negative_qty_items = []

    for key, cur in current_lines.items():
        prev = previous_lines.get(key)
        prev_qty = flt(prev["qty"]) if prev else 0
        delta = flt(cur["qty"]) - prev_qty
        if delta == 0:
            continue
        item = dict(cur)
        item["qty"] = delta
        if delta > 0:
            positive_qty_items.append(item)
        else:
            negative_qty_items.append(item)

    removed_item = []
    for key, prev in previous_lines.items():
        if key in current_lines:
            continue
        item = dict(prev)
        item["qty"] = -flt(prev["qty"])
        removed_item.append(item)

    pos_profile_id = pos_invoice.pos_profile
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    kot_naming_series = pos_profile.custom_kot_naming_series
    if kot_naming_series:
        cancel_kot_naming_series = "CNCL-" + kot_naming_series
    else:
        frappe.throw(
            "KOT Naming Series is mandatory for the auto creation of KOT.Ensure it is configured in the POS Profile: %s"
            % pos_profile.name
        )

    from ury.ury.api.ury_waiter_print import print_combined_waiter_order_slip

    total_cancel_items = negative_qty_items + removed_item
    created_kot_names = []

    if positive_qty_items:
        created_kot_names.extend(
            process_items_for_kot(
                invoice_id,
                customer,
                restaurant_table,
                positive_qty_items,
                comments,
                pos_profile_id,
                kot_naming_series,
                "New Order",
            )
        )
    if total_cancel_items:
        created_kot_names.extend(
            process_items_for_cancel_kot(
                invoice_id,
                customer,
                restaurant_table,
                total_cancel_items,
                comments,
                pos_profile_id,
                cancel_kot_naming_series,
                "Partially cancelled",
                list(previous_lines.values()),
            )
        )

    if created_kot_names:
        print_combined_waiter_order_slip(invoice_id, created_kot_names, restaurant_table)


# Compare two arrays and return the items that are different
def compare_two_array(array_1, array_2):
    finalarray = []
    for index, x in enumerate(array_1):
        a = list(
            filter(
                lambda y: y["item_code"] == x["item_code"] and y["qty"] == x["qty"],
                array_2,
            )
        )
        if len(a) == 0:
            b = list(filter(lambda z: z["item_code"] == x["item_code"], array_2))
            for qtb in b:
                x["qty"] = int(x["qty"]) - int(qtb["qty"])
            finalarray.append(x)
    return finalarray


# Get the items that have been removed from the second array compared to the first array
def get_removed_items(array_1, array_2):
    removed_objects = [
        obj
        for obj in array_1
        if obj["item_code"] not in [x["item_code"] for x in array_2]
    ]
    return removed_objects
