import frappe
from frappe.desk.page.setup_wizard.setup_wizard import load_languages, load_country, setup_complete
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

@frappe.whitelist()
def submit_setup(payload=None, **kwargs):
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted")
        
    if payload is None:
        payload = kwargs.copy()
    elif isinstance(payload, str):
        payload = json.loads(payload)
        
    fy_start_date_str = payload.get("fy_start_date")
    if fy_start_date_str:
        if len(fy_start_date_str) == 5:
            current_year = datetime.today().year
            fy_start_date_str = f"{current_year}-{fy_start_date_str}"
        fy_start_dt = datetime.strptime(fy_start_date_str, "%Y-%m-%d")
        fy_end_dt = fy_start_dt + relativedelta(months=12, days=-1)
        payload["fy_start_date"] = fy_start_dt.strftime("%Y-%m-%d")
        payload["fy_end_date"] = fy_end_dt.strftime("%Y-%m-%d")
        
    for field in ["admin_password", "email", "first_name", "last_name", "cmd"]:
        payload.pop(field, None)
    setup_complete(args=payload)
    return {"status": "success"}
        
@frappe.whitelist()
def complete_wizard_setup(payload=None, **kwargs):
    if payload is None:
        payload = kwargs.copy()
    return submit_setup(payload=payload)
