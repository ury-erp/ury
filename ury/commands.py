import click
import frappe
from frappe.commands import pass_context


@click.command("seed-demo-data")
@click.option("--company", "company_name", default=None, help="Company to seed demo data against.")
@click.option("--branch", "branch_name", default=None, help="Branch to seed demo data against.")
@pass_context
def seed_demo_data(context, company_name=None, branch_name=None):
	"""Seed demo data for the current site.

	This is a deliberate, on-demand action only — it must never run
	automatically via the scheduler. Run it explicitly when demo data is
	actually wanted, e.g.:

		bench --site <site> seed-demo-data
	"""
	from ury.ury.dev_seed.demo_runner import seed_all

	for site in context.sites:
		frappe.init(site=site)
		frappe.connect()
		try:
			seed_all(company_name=company_name, branch_name=branch_name)
		finally:
			frappe.destroy()


commands = [
	seed_demo_data,
]
