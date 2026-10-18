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


@click.command("uat-simulate-day")
@click.option("--branch", default="URY", help="Branch to run simulation for.")
@click.option("--company", default=None, help="Company name.")
@click.option("--pos-profile", default=None, help="POS Profile name.")
@click.option("--date", "business_date", default=None, help="Business date (YYYY-MM-DD).")
@click.option("--slots", "slot_count", default=12, type=int, help="Number of slots to simulate.")
@click.option("--auto-close/--no-auto-close", default=True, help="Automatically close POS session.")
@pass_context
def uat_simulate_day(
	context,
	branch,
	company=None,
	pos_profile=None,
	business_date=None,
	slot_count=12,
	auto_close=True,
):
	"""Run (or resume) the UAT data simulator for one branch and day.

	Manufacturing -> POS session -> simulated orders -> closing and
	consolidation, with a Markdown report saved on the URY Simulation Run.
	Refuses to run unless the UAT simulator is authorized for the site
	(allow_uat_simulator in site_config.json). With --no-auto-close the
	session is left open for the scheduler cron hook to work off:

		bench --site <site> uat-simulate-day --branch URY --no-auto-close
	"""
	from ury.ury.simulator.service import run_daily_simulation

	for site in context.sites:
		frappe.init(site=site)
		frappe.connect()
		try:
			summary = run_daily_simulation(
				branch=branch,
				company=company,
				pos_profile=pos_profile,
				business_date=business_date,
				auto_close=auto_close,
				slot_count=slot_count,
			)
		finally:
			frappe.destroy()

		click.echo("Simulation run {0}: status={1}".format(summary["run_id"], summary["status"]))
		click.echo(
			"  manufacturing: {0}".format(
				summary["manufacturing"]["sales_plan"] if summary.get("manufacturing") else "skipped"
			)
		)
		click.echo("  opening:  {0}".format(summary.get("pos_opening_entry") or "-"))
		click.echo("  closing:  {0}".format(summary.get("pos_closing_entry") or "-"))
		click.echo(
			"  invoices: {0} ({1} revenue)".format(
				summary["counters"]["total_invoices"], summary["counters"]["total_revenue"]
			)
		)
		click.echo("  consolidated SI: {0}".format(summary.get("consolidated_sales_invoice") or "-"))


commands = [
	seed_demo_data,
	uat_simulate_day,
]
