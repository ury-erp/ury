import os
import json
import frappe
from frappe.geo.country_info import get_all
from frappe.desk.page.setup_wizard.setup_wizard import load_languages
import pytz
import calendar

def execute():
    # This is designed to be run from `bench execute ury.scripts.generate_static_data.execute`
    base_dir = os.path.join(frappe.get_app_path("ury"), "frontend", "src", "data", "static")
    os.makedirs(base_dir, exist_ok=True)
    
    # languages
    langs = load_languages()
    with open(os.path.join(base_dir, "languages.json"), "w") as f:
        json.dump(langs, f, indent=2)
        
    # timezones
    tzs = pytz.all_timezones
    with open(os.path.join(base_dir, "timezones.json"), "w") as f:
        json.dump(tzs, f, indent=2)
        
    # countries and currencies
    countries_data = get_all()
    countries = list(countries_data.keys())
    with open(os.path.join(base_dir, "countries.json"), "w") as f:
        json.dump(countries, f, indent=2)
        
    currencies_set = set()
    currencies = []
    for c_name, c_info in countries_data.items():
        if "currency" in c_info:
            curr = c_info["currency"]
            if curr not in currencies_set:
                currencies_set.add(curr)
                currencies.append({
                    "value": curr,
                    "label": f"{curr}",
                    "symbol": c_info.get("currency_symbol", "")
                })
    with open(os.path.join(base_dir, "currencies.json"), "w") as f:
        json.dump(currencies, f, indent=2)
        
    # fy_start_dates
    months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
    fy_dates = []
    for m in months:
        month_name = calendar.month_abbr[int(m)]
        fy_dates.append({"value": f"{m}-01", "label": f"{month_name} 1"})
    
    with open(os.path.join(base_dir, "fy_start_dates.json"), "w") as f:
        json.dump(fy_dates, f, indent=2)
        
    print(f"Generated static data in {base_dir}")

def generate():
    frappe.init(site="ury.local")
    frappe.connect()
    execute()

if __name__ == "__main__":
    generate()
