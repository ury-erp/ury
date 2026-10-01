import frappe
from frappe import _
from datetime import datetime


def validate_daily_checklists(doc, method):
    # Retrieve POS profile details
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    branch = pos_profile.branch
    checklist = pos_profile.dependent_checklist

    # Parse start date
    start_date = doc.period_start_date
    if isinstance(start_date, str):
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")

    # Initialize quality checklist and non-completed checklist
    doc.quality_checklist = []
    non_completed_checklists = []

    def validate_and_throw(error_messages):
        if error_messages != []:
            error_list = [_("{}".format(msg)) for msg in error_messages]
            frappe.throw(error_list, title=_("Validation Error"), as_list=True)

    # Check for POS Closing Entry in the checklist
    for qc in checklist:
        if qc.select_2 == "POS Closing Entry":
            quality_reviews = frappe.db.sql(
                """
				SELECT goal
				FROM `tabQuality Review`
				WHERE branch = %s
					AND `creation` >= %s
				""",
                (branch, start_date),
                as_dict=True,
            )
            have = any(qr.goal == qc.quality_checklist for qr in quality_reviews)
            if have:
                doc.append(
                    "quality_checklist",
                    {"checklist": qc.quality_checklist, "check_2": 1},
                )
            elif not have:
                non_completed_checklists.append(
                    _("Pending checklist: {} ").format(
                        frappe.bold(qc.quality_checklist)
                    )
                )

    validate_and_throw(non_completed_checklists)
