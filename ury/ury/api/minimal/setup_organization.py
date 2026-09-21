import frappe
from frappe import _
from frappe.desk.page.setup_wizard.setup_wizard import load_languages, setup_complete

try:
    # Frappe v15 and earlier exposed GeoIP-based country detection here.
    from frappe.desk.page.setup_wizard.setup_wizard import load_country
except ImportError:  # pragma: no cover - depends on installed Frappe version
    # Frappe v16 removed load_country() (and the whole GeoIP helper it used,
    # frappe.sessions.get_geo_ip_country) from the setup wizard. There is no
    # replacement API, so detection is simply unavailable: return None and let
    # get_setup_defaults() fall back to System Settings / the default country.
    def load_country():
        return None
from frappe.geo.country_info import get_country_info, get_all
from erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts import get_charts_for_country
import pytz
import json
from dateutil.relativedelta import relativedelta
from datetime import datetime

@frappe.whitelist()
def get_setup_defaults():
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")
        
    languages = load_languages()
    country_data = load_country()
    if isinstance(country_data, str):
        detected_country = country_data
    elif isinstance(country_data, dict):
        detected_country = country_data.get("country", "")
    else:
        detected_country = ""
        
    if not detected_country:
        detected_country = frappe.db.get_single_value("System Settings", "country") or "India"
    
    countries_dict = get_all()
    countries = list(countries_dict.keys())
    
    currencies_set = set()
    currencies = []
    
    timezones = pytz.all_timezones
    
    for c_name, c_info in countries_dict.items():
        if "currency" in c_info:
            curr = c_info["currency"]
            if curr not in currencies_set:
                currencies_set.add(curr)
                currencies.append({
                    "value": curr,
                    "label": f"{curr}",
                    "symbol": c_info.get("currency_symbol", "")
                })
                
    return {
        "languages": languages,
        "detected_country": detected_country,
        "countries": countries,
        "currencies": currencies,
        "timezones": timezones
    }

@frappe.whitelist()
def get_country_defaults(country):
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")
        
    country_info = get_country_info(country)
    
    currency = country_info.get("currency")
    timezone = country_info.get("timezones", [None])[0] if country_info.get("timezones") else None
    
    charts = get_charts_for_country(country, with_standard=True)
    
    charts_of_accounts = []
    for chart in charts:
        charts_of_accounts.append({
            "value": chart,
            "label": chart
        })
        
    return {
        "currency": currency,
        "timezone": timezone,
        "charts_of_accounts": charts_of_accounts
    }

def _normalize_setup_payload(payload=None, **kwargs):
    from ury.setup.setup_wizard import _wants_ury_demo

    if payload is None:
        payload = kwargs.copy()
    elif isinstance(payload, str):
        payload = json.loads(payload)
    else:
        payload = dict(payload)

    fy_start_date_str = payload.get("fy_start_date")
    if fy_start_date_str:
        if len(str(fy_start_date_str)) == 5:
            current_year = datetime.today().year
            fy_start_date_str = f"{current_year}-{fy_start_date_str}"
        fy_start_dt = datetime.strptime(str(fy_start_date_str), "%Y-%m-%d")
        fy_end_dt = fy_start_dt + relativedelta(months=12, days=-1)
        payload["fy_start_date"] = fy_start_dt.strftime("%Y-%m-%d")
        payload["fy_end_date"] = fy_end_dt.strftime("%Y-%m-%d")

    for field in ["admin_password", "email", "first_name", "last_name", "cmd", "setup_demo"]:
        payload.pop(field, None)

    payload["setup_ury_demo"] = 1 if _wants_ury_demo(payload) else 0
    return payload


@frappe.whitelist()
def get_setup_progress_steps(setup_ury_demo=0):
    """Stage labels Frappe will run, so the wizard can list them before work starts."""
    from frappe.desk.page.setup_wizard.setup_wizard import get_setup_stages
    from ury.setup.setup_wizard import _wants_ury_demo

    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")

    args = frappe._dict({"setup_ury_demo": 1 if _wants_ury_demo({"setup_ury_demo": setup_ury_demo}) else 0})
    steps = []
    for stage in get_setup_stages(args):
        app = "frappe"
        for task in stage.get("tasks") or []:
            if task.get("app_name"):
                app = task.get("app_name")
                break
        steps.append({"status": stage.get("status"), "app": app})
    return steps


# Site-wide, not per-user: a background setup runs in a worker process whose
# session user need not match the one that submitted the wizard, and only one
# setup can be in flight per site anyway.
_PROGRESS_CACHE_KEY = "ury_setup_progress"
_PROGRESS_CACHE_TTL = 900


def _progress_cache_key():
    return _PROGRESS_CACHE_KEY


def _remember_setup_task(message):
    """Mirror a `setup_task` payload into the cache for HTTP pollers.

    The realtime socket stays the primary channel; this copy is what
    get_setup_progress_status() serves to a client that cannot reach it.
    """
    if isinstance(message, dict):
        frappe.cache.set_value(_progress_cache_key(), message, expires_in_sec=_PROGRESS_CACHE_TTL)


def _clear_setup_progress():
    frappe.cache.delete_value(_progress_cache_key())


def record_setup_failure(traceback=None, args=None):
    """`setup_wizard_exception` hook: record a failed setup for HTTP pollers.

    Frappe announces a failed background setup only through the `setup_task`
    realtime event, so with the socket down the wizard waits forever and the
    user never learns it failed. This hook also runs inside the background
    worker, where submit_setup()'s publish_realtime patch does not exist.
    """
    fail_msg = _("Setup failed")
    if traceback:
        last_line = next(
            (line.strip() for line in reversed(str(traceback).splitlines()) if line.strip()),
            "",
        )
        if last_line:
            fail_msg = f"{fail_msg}: {last_line}"

    _remember_setup_task({"status": "fail", "fail_msg": fail_msg})


def _run_setup_complete(payload):
    """Retry the first-stage User timezone write if a concurrent request touched tabUser."""
    from time import sleep

    last_error = None
    for attempt in range(3):
        try:
            return setup_complete(args=payload)
        except frappe.QueryDeadlockError as exc:
            last_error = exc
            frappe.db.rollback()
            sleep(0.4 * (attempt + 1))
    if last_error:
        raise last_error
    frappe.throw("Setup failed")


@frappe.whitelist()
def get_setup_progress_status():
    """Latest setup_task payload, for clients that cannot use the socket.

    Completion is read back from the database rather than the cache: a
    background worker finishes the run without this process seeing the
    final event, so the cache alone can never report "ok".
    """
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")

    if frappe.is_setup_complete():
        return {"status": "ok"}

    return frappe.cache.get_value(_progress_cache_key()) or {}


@frappe.whitelist()
def submit_setup(payload=None, **kwargs):
    from frappe.utils import cint
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")

    if cint(frappe.db.get_single_value("System Settings", "setup_complete")):
        frappe.throw("Setup already completed")

    payload = _normalize_setup_payload(payload, **kwargs)

    # A previous attempt's progress (or failure) must not be read as this one's.
    _clear_setup_progress()

    original = frappe.publish_realtime

    def wrapped(event=None, message=None, *args, **kw):
        if event == "setup_task":
            _remember_setup_task(message)
            # Fan out to the website room so the SPA still hears the event
            # if the socket joined "website" but missed the user room.
            original(event, message, room="website")
        return original(event, message, *args, **kw)

    frappe.publish_realtime = wrapped
    try:
        return _run_setup_complete(payload)
    finally:
        frappe.publish_realtime = original


@frappe.whitelist()
def complete_wizard_setup(payload=None, **kwargs):
    if payload is None:
        payload = kwargs.copy()
    return submit_setup(payload=payload)

@frappe.whitelist()
def get_wizard_status():
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")

    return {
        "step1_complete": bool(frappe.db.exists("Company", {})),
        "step2_complete": bool(frappe.db.exists("Branch", {}))
    }
