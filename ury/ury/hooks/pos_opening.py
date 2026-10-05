import frappe


def update_daily_checklists(doc, event):
    # Initialize quality checklist
    doc.quality_checklist = []

    # Retrieve POS profile details
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    branch = pos_profile.branch
    checklist = pos_profile.dependent_checklist

    # Retrieve quality reviews for the specified branch and date
    quality_reviews = frappe.get_all(
        "Quality Review",
        fields=["goal"],
        filters={"branch": branch, "date": doc.posting_date},
    )

    # Identify pending checklists for POS Opening Entry
    non_completed_checklists = [
        qc.quality_checklist
        for qc in checklist
        if qc.select_2 == "POS Opening Entry"
        and not any(qr.goal == qc.quality_checklist for qr in quality_reviews)
    ]

    # Raise an exception if there are pending checklists
    if non_completed_checklists:
        frappe.throw(
            title="Daily Checklists not completed",
            msg=("Pending:  {0}").format(",  ".join(non_completed_checklists)),
        )
