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

    frappe.response["type"] = "download"
    frappe.response["filename"] = "sw.js"
    frappe.response["filecontent"] = content
    frappe.response["content_type"] = "application/javascript; charset=utf-8"
    frappe.response["display_content_as"] = "inline"


def after_request(response):
    if response and frappe.request and (
        frappe.request.path == SERVICE_WORKER_PATH
        or "get_service_worker" in frappe.request.path
    ):
        response.mimetype = "application/javascript"
        response.headers["Content-Type"] = "application/javascript; charset=utf-8"
        response.headers["Service-Worker-Allowed"] = "/"
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        if "Content-Disposition" in response.headers:
            del response.headers["Content-Disposition"]
    return response
