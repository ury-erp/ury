# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class URYYieldCheck(Document):
	def validate(self):
		self.validate_item_yield_tracking_enabled()
		self.validate_input_qty()
		self.capture_standard_yield_snapshot()
		self.compute_yield_and_variance()
		self.validate_branch_company_consistency()
		self.validate_stock_uom_match()
		self.validate_issue_authorization()

	def validate_item_yield_tracking_enabled(self):
		"""Check 1: Item must have custom_yield_tracked enabled."""
		item = frappe.db.get_value("Item", self.item, "custom_yield_tracked")
		if not item:
			frappe.throw(
				_("Yield tracking is not enabled for this item."),
				frappe.ValidationError
			)

	def validate_input_qty(self):
		"""Check 2: Input quantity must be greater than zero."""
		if not self.input_qty or self.input_qty <= 0:
			frappe.throw(
				_("Input quantity must be greater than zero."),
				frappe.ValidationError
			)

	def capture_standard_yield_snapshot(self):
		"""Check 3: Capture Item.custom_yield_percent at save time (only on insert).

		Also validates that if custom_yield_tracked is true, custom_yield_percent must be > 0.
		"""
		if not self.standard_yield_percent_snapshot:
			item_yield = frappe.db.get_value("Item", self.item, "custom_yield_percent") or 0.0

			# I6: If item is yield-tracked, require a non-zero standard yield percent
			if item_yield <= 0:
				frappe.throw(
					_("Item {0} is marked yield-tracked but has no standard yield percent set — set a value in Yield Standards first.").format(self.item),
					frappe.ValidationError
				)

			self.standard_yield_percent_snapshot = item_yield

	def compute_yield_and_variance(self):
		"""Check 4: Compute actual_yield_percent and variance_percent."""
		if self.input_qty and self.input_qty > 0:
			self.actual_yield_percent = (self.output_qty / self.input_qty) * 100
		else:
			self.actual_yield_percent = 0.0

		self.variance_percent = self.actual_yield_percent - (self.standard_yield_percent_snapshot or 0.0)

	def validate_branch_company_consistency(self):
		"""Check 5: Mirror IPC pattern - assert branch's company matches self.company."""
		if not self.branch:
			frappe.throw(
				_("Branch is required."),
				frappe.ValidationError
			)

		branch_company = frappe.db.get_value("Branch", self.branch, "company")

		if not branch_company:
			frappe.throw(
				_("Branch {0} must belong to a Company.").format(self.branch),
				frappe.ValidationError
			)

		if branch_company != self.company:
			frappe.throw(
				_("Branch {0} belongs to Company {1}, but this document is linked to Company {2}.").format(
					self.branch, branch_company, self.company
				),
				frappe.ValidationError
			)

	def validate_stock_uom_match(self):
		"""Check 6: Assert stock_uom matches Item.stock_uom."""
		if not self.item:
			frappe.throw(
				_("Item is required."),
				frappe.ValidationError
			)

		item_stock_uom = frappe.db.get_value("Item", self.item, "stock_uom")

		if not item_stock_uom:
			frappe.throw(
				_("Item {0} does not have a stock UOM defined.").format(self.item),
				frappe.ValidationError
			)

		if self.stock_uom != item_stock_uom:
			frappe.throw(
				_("Stock UOM {0} does not match Item {1}'s stock UOM {2}.").format(
					self.stock_uom, self.item, item_stock_uom
				),
				frappe.ValidationError
			)

	def validate_issue_authorization(self):
		"""Check 7: If issue_authorization is set, validate it fully."""
		if not self.issue_authorization:
			return

		# Fetch the issue_authorization document
		auth_doc = frappe.db.get_value(
			"URY Issue Authorization",
			self.issue_authorization,
			["name", "component_item", "status", "authorized_qty"],
			as_dict=True
		)

		if not auth_doc:
			frappe.throw(
				_("Issue Authorization {0} not found.").format(self.issue_authorization),
				frappe.ValidationError
			)

		# (a) Check component_item matches self.item
		if auth_doc.get("component_item") != self.item:
			frappe.throw(
				_("Issue Authorization {0} is for Item {1}, but this check is for Item {2}.").format(
					self.issue_authorization, auth_doc.get("component_item"), self.item
				),
				frappe.ValidationError
			)

		# (b) Check status is "Authorized"
		if auth_doc.get("status") != "Authorized":
			frappe.throw(
				_("Issue Authorization {0} is not in 'Authorized' status.").format(self.issue_authorization),
				frappe.ValidationError
			)

		# (c) Check no other URY Yield Check references this authorization
		existing_checks = frappe.get_all(
			"URY Yield Check",
			filters={
				"issue_authorization": self.issue_authorization,
				"name": ("!=", self.name)
			},
			fields=["name"]
		)

		if existing_checks:
			frappe.throw(
				_("Issue Authorization {0} is already referenced by another Yield Check ({1}). "
				  "Each authorization can have at most one check.").format(
					self.issue_authorization, existing_checks[0].name
				),
				frappe.ValidationError
			)

		# Optional: Default input_qty from authorized_qty if not set
		if (not self.input_qty or self.input_qty == 0) and auth_doc.get("authorized_qty"):
			self.input_qty = auth_doc.get("authorized_qty")
