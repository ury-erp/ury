# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import requests
import json
from frappe.model.document import Document

from ury.ury.api.ury_print import check_printer_ready, is_strict_print, print_via_cups


class URYKOT(Document):
    def on_submit(self):
        self.multi_print_kot()
        self.kotDisplayRealtime()

    def before_submit(self):
        self.userSetting()
        self.set_kot_number()

    def set_kot_number(self):
        """Sequential ticket number shown on the printed KOT instead of the
        internal document name. Resets each day when the POS Profile has
        'Reset Order Number Daily' enabled, else counts up forever."""
        if self.kot_number or self.type not in ("New Order", "Order Modified"):
            return
        filters = [
            ["branch", "=", self.branch],
            ["docstatus", "=", 1],
            ["type", "in", ["New Order", "Order Modified"]],
            ["kot_number", ">", 0],
        ]
        daily_reset = frappe.db.get_value(
            "POS Profile", self.pos_profile, "custom_reset_order_number_daily"
        )
        if daily_reset:
            filters.append(["creation", ">=", frappe.utils.today()])
        self.kot_number = frappe.db.count("URY KOT", filters=filters) + 1

    # Function for printing multiple KOTs.
    def multi_print_kot(self):
        # Collect print targets first, then print, so strict mode can verify
        # every printer is reachable before a single slip comes out.
        targets = []
        # The same physical printer may be configured on the POS Profile, the
        # production unit and the room; print each (printer, format) pair only
        # once per KOT. Same printer with two different formats prints both —
        # that is how a single-printer site gets Kitchen + Billing slips.
        seen = set()

        def add_target(printer, kot_print_format):
            if (printer, kot_print_format) in seen:
                return
            seen.add((printer, kot_print_format))
            targets.append((printer, kot_print_format))


        pos_kot_printers = frappe.db.get_all(
            "URY Printer Settings",
            fields=["printer", "custom_kot_print_format","custom_kot_print"],
            filters={"parent": self.pos_profile, "custom_kot_print": 1,"parenttype":"POS Profile"},
            order_by="idx"
        )

        pos_print_flag = True
        if self.production:
            production_unit_printers = frappe.get_all(
                "URY Printer Settings",
                fields=["printer", "custom_kot_print_format","custom_kot_print","custom_block_takeaway_kot"],
                filters={"parent": self.production, "custom_kot_print": 1,"parenttype":"URY Production Unit"},
                order_by="idx"
            )

            # If production unit printer is specified, print KOT in production printer
            if production_unit_printers:
                for printer in production_unit_printers:
                    pos_print_flag = False
                    if printer.custom_block_takeaway_kot == 1 :
                        if self.restaurant_table and self.table_takeaway == 0:
                            add_target(printer.printer, printer.custom_kot_print_format)
                    else:
                        add_target(printer.printer, printer.custom_kot_print_format)

                # Check if restaurant table is specified and it's not a takeaway order
                if self.restaurant_table and self.table_takeaway == 0:
                    room = frappe.db.get_value(
                        "URY Table", self.restaurant_table, "restaurant_room"
                    )

                    room_kot_printers = frappe.get_all(
                        "URY Printer Settings",
                        fields=["printer", "custom_kot_print_format","custom_kot_print"],
                        filters={"parent": room, "custom_kot_print": 1,"parenttype":"URY Room"},
                        order_by="idx"
                    )

                    # If room printer is specified, print KOT in room
                    if room_kot_printers:
                        for printer in room_kot_printers:
                            pos_print_flag = False
                            add_target(printer.printer, printer.custom_kot_print_format)

                    if pos_print_flag == True:
                        if pos_kot_printers:
                            for printer in pos_kot_printers:
                                add_target(printer.printer, printer.custom_kot_print_format)

                else:
                    if pos_kot_printers:
                        for printer in pos_kot_printers:
                            add_target(printer.printer, printer.custom_kot_print_format)

        strict = is_strict_print(self.pos_profile)

        if strict:
            # Fail before ANY slip prints: a dead print node or stopped queue
            # aborts the whole KOT (and with it the order) up front. A printer
            # that is powered off behind a live node is only caught by the
            # job-state polling below — that slip-level failure can leave
            # earlier slips already printed.
            for printer_setting in dict.fromkeys(t[0] for t in targets):
                check_printer_ready(printer_setting)

        for printer, kot_print_format in targets:
            try:
                print_via_cups(
                    "URY KOT", self.name, printer, kot_print_format, strict=bool(strict)
                )
            except Exception:
                if strict:
                    raise
                frappe.log_error(frappe.get_traceback(), "KOT Print Failed")


    # Function for displaying KOT-related information in real-time On KDS(Kitchen Display System)
    def kotDisplayRealtime(self):
        currentBranch = self.branch
        production = self.production

        if production:
            production_doc = frappe.get_doc("URY Production Unit", production)
            if production_doc.enable_order_type_wise_display_on_mosaic:
                invoice_order_type = frappe.db.get_value("POS Invoice", self.invoice, "order_type")
                allowed_order_types = [row.order_type for row in production_doc.get("order_type", [])]
                if invoice_order_type not in allowed_order_types:
                    return

        kotjson = json.loads(frappe.as_json(self))
        audio_file = frappe.db.get_value(
            "POS Profile", self.pos_profile, "custom_kot_alert_sound"
        )
        cache_key = "{}_{}_last_kot_time".format(currentBranch, production)
        time = frappe.cache().get_value(cache_key)
        kot_channel = "{}_{}_{}".format("kot_update", currentBranch, production)
        frappe.publish_realtime(
            kot_channel,
            {"kot": kotjson, "audio_file": audio_file, "last_kot_time": time},
        )
        frappe.cache().set_value(cache_key, self.time)

    def userSetting(self):
        # Prefer the waiter tagged on the order; fall back to the KOT creator.
        # `waiter` may hold an employee display name (tagged in POS) or a user id
        # (older orders / untagged) — resolve a user id to its full name, else
        # show the stored value as-is.
        waiter = (
            frappe.db.get_value("POS Invoice", self.invoice, "waiter")
            if self.invoice
            else None
        ) or self.owner
        self.user = frappe.db.get_value("User", waiter, "full_name") or waiter
