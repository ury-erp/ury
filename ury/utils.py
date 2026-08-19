import os
import frappe

SERVICE_WORKER_PATH = "/assets/ury/pos/sw.js"


@frappe.whitelist(allow_guest=True)
def get_service_worker():
    sw_path = frappe.get_app_path("ury", "public", "pos", "sw.js")
    if not os.path.exists(sw_path):
        frappe.throw("Service worker not found", frappe.DoesNotExistError)

    with open(sw_path, "rb") as f:
        content = f.read()

    frappe.response["type"] = "binary"
    frappe.response["filename"] = "sw.js"
    frappe.response["filecontent"] = content
    frappe.response["content_type"] = "application/javascript; charset=utf-8"


def after_request(response):
    if frappe.request and (
        frappe.request.path == SERVICE_WORKER_PATH
        or "get_service_worker" in frappe.request.path
    ):
        response.headers["Service-Worker-Allowed"] = "/"
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
