# Copyright (c) 2026, Safwan Erooth and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today


class StaffDiscountPolicy(Document):
	pass


def _is_within_validity(policy, on_date):
	if policy.valid_from and getdate(policy.valid_from) > on_date:
		return False
	if policy.valid_to and getdate(policy.valid_to) < on_date:
		return False
	return True


def _matches_eligibility(policy, role=None, department=None, customer_group=None):
	if policy.applies_to == "Role":
		return bool(role) and role == policy.role
	if policy.applies_to == "Employee Group":
		return bool(department) and department == policy.employee_group
	if policy.applies_to == "Customer Group":
		return bool(customer_group) and customer_group == policy.customer_group
	return False


def _matches_item_group(policy, item_group=None):
	if not item_group:
		return True
	if not policy.eligible_item_groups:
		return True
	return any(row.item_group == item_group for row in policy.eligible_item_groups)


@frappe.whitelist()
def get_applicable_policy(customer=None, employee=None, branch=None, item_group=None):
	"""
	Resolve the best-matching, enabled Staff Discount Policy for the given
	context.

	Priority:
		1. A branch-specific policy (policy.branch == branch) over a global
		   policy (policy.branch is empty), mirroring get_alert_rule's
		   branch-override-then-global-default pattern.
		2. Among policies of equal branch-specificity, eligibility is matched
		   against the resolved role(s)/department/customer_group, validity
		   dates are checked against today, and item_group restrictions (if
		   any) are respected.

	Args:
		customer: Customer name, used when a policy's applies_to is
			"Customer Group".
		employee: Employee name, used to resolve role (via the Employee's
			linked User) or department when a policy's applies_to is
			"Role" or "Employee Group" respectively.
		branch: Branch name to scope the lookup to.
		item_group: Item Group name of the item being discounted; policies
			that restrict eligible_item_groups are only matched if this is
			one of them (or if the policy has no restriction).

	Returns:
		dict: The matching Staff Discount Policy as a dict, or None if no
		enabled policy matches.
	"""
	roles = []
	department = None
	if employee:
		user_id, department = frappe.db.get_value(
			"Employee", employee, ["user_id", "department"]
		) or (None, None)
		if user_id:
			roles = frappe.get_roles(user_id)

	customer_group = None
	if customer:
		customer_group = frappe.db.get_value("Customer", customer, "customer_group")

	filters = {"enabled": 1}
	policy_names = frappe.get_all("Staff Discount Policy", filters=filters, pluck="name")
	if not policy_names:
		return None

	on_date = getdate(today())
	candidates = []
	for name in policy_names:
		policy = frappe.get_doc("Staff Discount Policy", name)

		if not _is_within_validity(policy, on_date):
			continue

		if policy.branch and branch and policy.branch != branch:
			continue
		if policy.branch and not branch:
			continue

		if policy.applies_to == "Role":
			matched = bool(roles) and policy.role in roles
		else:
			matched = _matches_eligibility(
				policy, department=department, customer_group=customer_group
			)

		if not matched:
			continue

		if not _matches_item_group(policy, item_group=item_group):
			continue

		candidates.append(policy)

	if not candidates:
		return None

	# Branch-specific policies win over global (branch-less) ones.
	branch_specific = [p for p in candidates if p.branch]
	best = branch_specific[0] if branch_specific else candidates[0]

	return best.as_dict()
