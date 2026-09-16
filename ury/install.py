import click
import frappe

from ury.setup_customizations import after_install as setup


def after_install():
    try:
        print("Setting up URY...")
        setup()

        click.secho("Thank you for installing URY App!", fg="green")


    except:
        pass


def before_tests():
	"""frappe.utils.install.before_tests() (the default hook) no-ops
	whenever more than one app is installed -- which is always true here
	(ury + erpnext + hrms + payments) -- so the setup wizard never runs on
	this site. That leaves base masters (Gender/Salutation from frappe core,
	Warehouse Type/Customer Group/Territory from erpnext, a default Company)
	missing, and the test runner's ad-hoc test records for those doctypes
	then crash with LinkValidationError/MandatoryError one at a time as each
	is discovered, before any real test in the app executes.

	This mirrors the exact recipe already proven out in
	.github/workflows/test.yml's "Setup Frappe" step (see the comment there
	for the full history) -- frappe core's own install_fixtures (Gender,
	Salutation, ...), then the actual setup_complete() the wizard calls
	(Company, erpnext's install_fixtures, defaults), each independently
	wrapped since setup_complete() errors partway through on an unrelated
	Sales Person nested-set issue but every fixture needed here is created
	earlier in its sequence and survives that -- plus the one fixture that
	comes after it (Warehouse Type: Transit) seeded explicitly as a
	fallback.
	"""
	frappe.clear_cache()

	from frappe.desk.page.setup_wizard.install_fixtures import install as frappe_install_fixtures

	try:
		frappe_install_fixtures()
	except Exception as e:
		print("frappe install_fixtures failed (expected, see workflow comment):", e)

	if not frappe.get_list("Company"):
		from erpnext.setup.setup_wizard.setup_wizard import setup_complete

		args = frappe._dict(
			{
				"country": "India",
				"currency": "INR",
				"language": "english",
				"company_name": "_Test Company",
				"company_abbr": "_TC",
				"fy_start_date": "2024-01-01",
				"fy_end_date": "2024-12-31",
				"chart_of_accounts": "Standard",
				"domain": "Retail",
				"domains": ["Retail"],
				"timezone": "Asia/Kolkata",
				"setup_demo": 0,
			}
		)
		try:
			setup_complete(args)
		except Exception as e:
			print("setup_complete partially failed (expected, see workflow comment):", e)

	frappe.db.commit()

	if not frappe.db.exists("Warehouse Type", "Transit"):
		frappe.get_doc({"doctype": "Warehouse Type", "name": "Transit"}).insert(ignore_permissions=True)

	if frappe.get_list("Company") and not frappe.defaults.get_global_default("company"):
		frappe.db.set_default("company", frappe.get_list("Company", pluck="name")[0])

	frappe.db.commit()
