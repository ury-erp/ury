import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ROLES = ("Restaurant Manager", "Finance Head")
WORKFLOW_STATES = ("Pending", "Approved", "Rejected", "Changes Requested", "Invalidated")
WORKFLOW_ACTIONS = ("Approve", "Reject", "Request Changes", "Submit", "Cancel")


def before_migrate():
	ensure_roles()
	_ensure_records("Workflow State", "workflow_state_name", WORKFLOW_STATES)
	_ensure_records("Workflow Action Master", "workflow_action_name", WORKFLOW_ACTIONS)


def after_migrate():
	ensure_workflow()


def after_install():
	before_migrate()
	create_approval_custom_fields()
	ensure_workflow()


def ensure_roles():
	_ensure_records("Role", "role_name", ROLES)


def _ensure_records(doctype, fieldname, values):
	for value in values:
		if not frappe.db.exists(doctype, value):
			frappe.get_doc({"doctype": doctype, fieldname: value}).insert(ignore_permissions=True)


def ensure_workflow():
	states = [
		{
			"state": state,
			"doc_status": "0",
			"allow_edit": "System Manager",
			"update_field": "status",
			"update_value": state,
		}
		for state in WORKFLOW_STATES
	]
	transitions = [
		{"state": "Pending", "action": "Approve", "next_state": "Approved"},
		{"state": "Pending", "action": "Reject", "next_state": "Rejected"},
		{"state": "Pending", "action": "Request Changes", "next_state": "Changes Requested"},
		{"state": "Pending", "action": "Cancel", "next_state": "Invalidated"},
		{"state": "Approved", "action": "Cancel", "next_state": "Invalidated"},
		{"state": "Changes Requested", "action": "Submit", "next_state": "Pending"},
		{"state": "Changes Requested", "action": "Approve", "next_state": "Approved"},
		{"state": "Changes Requested", "action": "Reject", "next_state": "Rejected"},
		{"state": "Changes Requested", "action": "Cancel", "next_state": "Invalidated"},
	]
	for transition in transitions:
		transition.update({"allowed": "All", "allow_self_approval": 1})
	values = {
		"doctype": "Workflow",
		"workflow_name": "URY Approval Request",
		"document_type": "URY Approval Request",
		"is_active": 1,
		"workflow_state_field": "status",
		"states": states,
		"transitions": transitions,
	}
	if frappe.db.exists("Workflow", "URY Approval Request"):
		workflow = frappe.get_doc("Workflow", "URY Approval Request")
		workflow.update(values)
		workflow.save(ignore_permissions=True)
	else:
		frappe.get_doc(values).insert(ignore_permissions=True)
	frappe.clear_cache(doctype="URY Approval Request")


def create_approval_custom_fields():
	create_custom_fields(get_approval_custom_fields())
	frappe.clear_cache()


def get_approval_custom_fields():
	branch_fields = [
		_section("custom_ury_approval_control_section", "URY Approval & Control", "custom_no_taxes"),
		_check(
			"custom_ury_master_approval_control",
			"Master Approval Control",
			"custom_ury_approval_control_section",
		),
		_check(
			"custom_ury_allow_self_approval",
			"Allow Requester Self Approval",
			"custom_ury_master_approval_control",
		),
		{
			"fieldname": "custom_ury_buying_price_list",
			"fieldtype": "Link",
			"label": "Branch Buying Price List",
			"options": "Price List",
			"insert_after": "custom_ury_allow_self_approval",
		},
		_section("custom_ury_purchase_approval_section", "Purchase Approval", "custom_ury_buying_price_list"),
		_check(
			"custom_ury_enable_purchase_approval",
			"Enable Purchase Approval",
			"custom_ury_purchase_approval_section",
		),
		_table(
			"custom_ury_purchase_approval_levels",
			"Purchase Approval Levels",
			"custom_ury_enable_purchase_approval",
		),
		_section(
			"custom_ury_payment_approval_section", "Payment Approval", "custom_ury_purchase_approval_levels"
		),
		_check(
			"custom_ury_enable_payment_approval",
			"Enable Payment Approval",
			"custom_ury_payment_approval_section",
		),
		{
			"fieldname": "custom_ury_default_bank_threshold",
			"fieldtype": "Currency",
			"label": "Default Bank Payment Threshold",
			"default": "100000",
			"insert_after": "custom_ury_enable_payment_approval",
		},
		{
			"fieldname": "custom_ury_cash_approver_role",
			"fieldtype": "Link",
			"label": "Default Cash Approver Role",
			"options": "Role",
			"default": "Finance Head",
			"insert_after": "custom_ury_default_bank_threshold",
		},
		{
			"fieldname": "custom_ury_advance_approver_role",
			"fieldtype": "Link",
			"label": "Default Advance Approver Role",
			"options": "Role",
			"default": "Finance Head",
			"insert_after": "custom_ury_cash_approver_role",
		},
		_table(
			"custom_ury_payment_approval_levels", "Payment Approval Rules", "custom_ury_advance_approver_role"
		),
		_section(
			"custom_ury_expense_approval_section", "Expense Approval", "custom_ury_payment_approval_levels"
		),
		_check(
			"custom_ury_enable_expense_approval",
			"Enable Expense Approval",
			"custom_ury_expense_approval_section",
		),
		_table(
			"custom_ury_expense_approval_levels",
			"Expense Approval Levels",
			"custom_ury_enable_expense_approval",
		),
		_section("custom_ury_backdated_section", "Backdated Control", "custom_ury_expense_approval_levels"),
		_check(
			"custom_ury_enable_backdated_control", "Enable Backdated Control", "custom_ury_backdated_section"
		),
		{
			"fieldname": "custom_ury_backdated_lock_day",
			"fieldtype": "Int",
			"label": "Previous Month Lock Day",
			"default": "5",
			"insert_after": "custom_ury_enable_backdated_control",
		},
		_check(
			"custom_ury_pnl_finalization_required",
			"P&L Finalization Required",
			"custom_ury_backdated_lock_day",
			default="1",
		),
		_table(
			"custom_ury_backdated_approval_levels",
			"Backdated Exception Approval Levels",
			"custom_ury_pnl_finalization_required",
		),
	]
	fields = {"Branch": branch_fields}
	for doctype in (
		"Purchase Invoice",
		"Purchase Order",
		"Purchase Receipt",
		"Payment Entry",
		"Employee Advance",
		"Expense Claim",
	):
		fields[doctype] = [
			{
				"fieldname": "custom_ury_branch",
				"fieldtype": "Link",
				"label": "URY Branch",
				"options": "Branch",
				"insert_after": "company",
			}
		]
	fields["Employee Advance"].extend(
		[
			{
				"fieldname": "custom_ury_expense_account",
				"fieldtype": "Link",
				"label": "URY Budget Expense Account",
				"options": "Account",
				"insert_after": "custom_ury_branch",
			},
			{
				"fieldname": "custom_ury_cost_center",
				"fieldtype": "Link",
				"label": "URY Budget Cost Center",
				"options": "Cost Center",
				"insert_after": "custom_ury_expense_account",
			},
		]
	)
	return fields


def _section(fieldname, label, insert_after):
	return {
		"fieldname": fieldname,
		"fieldtype": "Section Break",
		"label": label,
		"collapsible": 1,
		"insert_after": insert_after,
	}


def _check(fieldname, label, insert_after, default="0"):
	return {
		"fieldname": fieldname,
		"fieldtype": "Check",
		"label": label,
		"default": default,
		"insert_after": insert_after,
	}


def _table(fieldname, label, insert_after):
	return {
		"fieldname": fieldname,
		"fieldtype": "Table",
		"label": label,
		"options": "URY Approval Level",
		"insert_after": insert_after,
	}
