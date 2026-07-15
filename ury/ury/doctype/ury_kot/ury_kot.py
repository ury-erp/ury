# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import requests
import json
from frappe.utils.print_format import print_by_server
from frappe.model.document import Document


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
        # The same physical printer may be configured on the POS Profile, the
        # production unit and the room; print each printer only once per KOT.
        printed = set()

        # Function for printing a KOT on a specified printer using a print format.
        def print_kot(printer, kot_print_format):
            if printer in printed:
                return
            printed.add(printer)
            try:
                # Print KOT using a server function (print_by_server)
                print_by_server("URY KOT", self.name, printer, kot_print_format)
            except:
                pass

        
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
                            print_kot(printer.printer, printer.custom_kot_print_format)
                    else:
                        print_kot(printer.printer, printer.custom_kot_print_format)

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
                            print_kot(printer.printer, printer.custom_kot_print_format)

                    if pos_print_flag == True:
                        if pos_kot_printers:
                            for printer in pos_kot_printers:
                                print_kot(printer.printer, printer.custom_kot_print_format)

                else:
                    if pos_kot_printers:
                        for printer in pos_kot_printers:
                            print_kot(printer.printer, printer.custom_kot_print_format)


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
