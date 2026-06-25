import frappe
from ury.setup.demo import setup_ury_demo_data, clear_demo_data

def run():
    company = "test (Demo)"
    
    # Ensure Global Defaults has demo_company so clear_demo_data works
    frappe.db.set_single_value("Global Defaults", "demo_company", company)
    frappe.db.set_default("demo_data_type", "ury")

    print("Setting up demo data...")
    try:
        setup_ury_demo_data(company)
        print("Setup complete.")
    except Exception as e:
        print(f"Setup Failed: {e}")
        import traceback
        traceback.print_exc()
        return

    print("Clearing demo data...")
    try:
        clear_demo_data()
        print("Clear complete. Success!")
    except Exception as e:
        print(f"Clear Failed: {e}")
        import traceback
        traceback.print_exc()

