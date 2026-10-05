import json
import traceback

import frappe
import ury.ury_pos.api as api


def run():
    try:
        _verify()
    except Exception:
        traceback.print_exc()


def _verify():
    # use the RM goal; clear its reviews first
    for n in frappe.get_all("Quality Review", filters={"goal": "RM Opening Checklist"}, pluck="name"):
        frappe.delete_doc("Quality Review", n, force=True, ignore_permissions=True)
    frappe.db.commit()

    frappe.set_user("rm@example.com")
    r = api.get_checklist("URY", "Opening")
    items = [i for i in r["items"] if i["goal"] == "RM Opening Checklist"]
    print("items:", [(i["item_label"][:25], i["status"], i["remarks"]) for i in items])

    # submit one FAIL + remark
    payload = [
        {"item_label": i["item_label"], "goal": i["goal"], "status": ("Failed" if k == 0 else "Passed"), "remarks": "test"}
        for k, i in enumerate(items)
    ]
    res = api.submit_checklist("URY", "Opening", json.dumps(payload))
    frappe.db.commit()
    print("submit FAIL+remark ->", res)

    # submit again keeping FAIL (resolve attempt fails again)
    items2 = [i for i in api.get_checklist("URY", "Opening")["items"] if i["goal"] == "RM Opening Checklist"]
    payload2 = [
        {"item_label": i["item_label"], "goal": i["goal"], "status": ("Failed" if "kitchen" in i["item_label"] else "Passed"), "remarks": "test2"}
        for i in items2
    ]
    res2 = api.submit_checklist("URY", "Opening", json.dumps(payload2))
    frappe.db.commit()
    print("resubmit FAIL ->", res2)

    # FAIL without remark must throw
    items3 = [i for i in api.get_checklist("URY", "Opening")["items"] if i["goal"] == "RM Opening Checklist"]
    payload3 = [
        {"item_label": i["item_label"], "goal": i["goal"], "status": ("Failed" if "kitchen" in i["item_label"] else "Passed"), "remarks": ""}
        for i in items3
    ]
    try:
        api.submit_checklist("URY", "Opening", json.dumps(payload3))
        print("FAIL w/o remark: NOT blocked (bad)")
    except frappe.ValidationError as e:
        print("FAIL w/o remark blocked:", str(e)[:60])
