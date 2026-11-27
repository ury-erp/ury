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
@click.option("--all-branches", is_flag=True, default=False, help="Run for every branch with an active POS Profile and menu.")
@click.option("--auto-close/--no-auto-close", default=True, help="Automatically close POS session.")
@pass_context
def uat_simulate_day(
	context,
	branch,
	company=None,
	pos_profile=None,
	business_date=None,
	slot_count=12,
	all_branches=False,
	auto_close=True,
):
	"""Run (or resume) the UAT data simulator for one branch and day.

	Manufacturing -> POS session -> simulated orders -> closing and
	consolidation, with a Markdown report saved on the URY Simulation Run.
	Refuses to run unless the UAT simulator is authorized for the site
	(allow_uat_simulator in site_config.json). With --no-auto-close the
	session is left open for the scheduler cron hook to work off:

		bench --site <site> uat-simulate-day --branch URY --no-auto-close

	With --all-branches the day is opened on every active branch (enabled
	POS Profile + enabled URY Menu); with auto-close each session is then
	worked off and closed in the same call.
	"""
	if all_branches:
		_run_simulation_for_all_branches(context, business_date, slot_count, auto_close)
		return

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

		_echo_branch_summary(summary)


def _run_simulation_for_all_branches(context, business_date, slot_count, auto_close):
	"""Open (and optionally close) the simulated day on every active branch."""
	from ury.ury.simulator.service import (
		initiate_daily_simulation_for_all_branches,
		run_daily_simulation,
	)

	for site in context.sites:
		frappe.init(site=site)
		frappe.connect()
		try:
			results = initiate_daily_simulation_for_all_branches(
				business_date=business_date, slot_count=slot_count
			)
			summaries = []
			for result in results:
				branch = result["branch"]
				if auto_close and result.get("run_id"):
					# Work off every slot and close the session in-line;
					# run_daily_simulation resumes the initiator's run
					# single-flight (manufacturing and the session are
					# reused, remaining slots processed, session closed).
					try:
						summary = run_daily_simulation(
							branch=branch,
							business_date=business_date,
							auto_close=True,
							slot_count=slot_count,
						)
					except Exception:
						frappe.log_error(
							frappe.get_traceback(),
							"URY UAT Simulator: --all-branches auto-close failed for {0}".format(branch),
						)
						summary = {
							"branch": branch,
							"run_id": result.get("run_id"),
							"status": "Failed",
						}
					summaries.append(summary)
				else:
					summaries.append(
						{
							"branch": branch,
							"run_id": result.get("run_id"),
							"status": result.get("status"),
							"pos_opening_entry": result.get("pos_opening_entry"),
							"pos_closing_entry": None,
							"counters": {},
						}
					)
		finally:
			frappe.destroy()

		if not summaries:
			click.echo(
				"No simulation branches executed -- either no branch has an active POS Profile + "
				"menu, or the UAT simulator is not authorized for this site."
			)
			continue
		_echo_all_branches_summary(summaries)


def _echo_branch_summary(summary):
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


def _echo_all_branches_summary(summaries):
	click.echo("All-branches simulation summary:")
	rows = [
		("Branch", "Run", "Status", "Opening", "Closing", "Invoices", "Revenue"),
	]
	for summary in summaries:
		counters = summary.get("counters") or {}
		rows.append(
			(
				summary.get("branch") or "-",
				summary.get("run_id") or "-",
				summary.get("status") or "-",
				summary.get("pos_opening_entry") or "-",
				summary.get("pos_closing_entry") or "-",
				str(counters.get("total_invoices") if counters.get("total_invoices") is not None else "-"),
				str(counters.get("total_revenue") if counters.get("total_revenue") is not None else "-"),
			)
		)
	widths = [max(len(row[i]) for row in rows) for i in range(len(rows[0]))]
	for index, row in enumerate(rows):
		click.echo("  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row)).rstrip())
		if index == 0:
			click.echo("  ".join("-" * width for width in widths).rstrip())


commands = [
	seed_demo_data,
	uat_simulate_day,
]
