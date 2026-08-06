import frappe

SERVICE_WORKER_PATH = "/assets/ury/pos/sw.js"


def after_request(response):
    """
    Add Service-Worker-Allowed header for the URY POS service worker so it can
    be registered with root scope ('/') and control the /pos page even though
    the script is served from /assets/ury/pos/sw.js.

    This only affects the Frappe development server. In production the same
    header must be added by the reverse proxy (nginx) for /assets/ury/pos/sw.js.
    """
    if frappe.request and frappe.request.path == SERVICE_WORKER_PATH:
        response.headers["Service-Worker-Allowed"] = "/"
    return response
