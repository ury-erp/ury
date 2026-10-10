# Copyright (c) 2026, Smart Choice and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class URYKitchenMessage(Document):
    def before_insert(self):
        self.sent_by = frappe.session.user
        self.sent_by_name = frappe.db.get_value("User", frappe.session.user, "full_name")
        self.sent_at = now_datetime()
        self.status = "Active"

    def after_insert(self):
        self.broadcast()

    def broadcast(self, event="new"):
        """
        Push the message to every kitchen display listening on this branch.

        One channel per branch rather than per production unit: a message with
        no `production` is meant for every station, and the display filters on
        arrival. That keeps a station from having to subscribe to two channels
        and de-duplicate between them.
        """
        frappe.publish_realtime(
            f"ury_kitchen_message_{self.branch}",
            {"event": event, "message": self.as_display_dict()},
        )

    def as_display_dict(self):
        """The shape the kitchen display consumes."""
        return {
            "name": self.name,
            "message": self.message,
            "priority": self.priority,
            "requires_acknowledgement": int(self.requires_acknowledgement or 0),
            "branch": self.branch,
            "production": self.production,
            "status": self.status,
            "sent_by_name": self.sent_by_name,
            "sent_at": str(self.sent_at) if self.sent_at else None,
            "expires_at": str(self.expires_at) if self.expires_at else None,
            "acknowledged_by": [
                {"user_name": row.user_name, "station": row.station,
                 "acknowledged_at": str(row.acknowledged_at)}
                for row in (self.acknowledgements or [])
            ],
        }

    def is_live(self):
        """Active and not past its expiry."""
        if self.status != "Active":
            return False
        if self.expires_at and now_datetime() > self.expires_at:
            return False
        return True
