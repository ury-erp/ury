"""Settle unpaid dine-in drafts left from earlier days so today's demo has free tables."""
import frappe
from frappe.utils import flt, today


def run():
	from ury.ury.api.ury_print import qz_print_update
	from ury.ury.doctype.ury_order.ury_order import make_invoice

	rows = frappe.get_all(
		"POS Invoice",
		filters={"docstatus": 0, "posting_date": ["<", today()], "restaurant_table": ["is", "set"]},
		fields=["name", "customer", "pos_profile", "owner", "restaurant_table", "rounded_total", "grand_total"],
	)
	modes = frappe.get_all("POS Payment Method", filters={"parenttype": "POS Profile"}, pluck="mode_of_payment", distinct=True) or ["Cash"]
	done, failed = [], []
	for r in rows:
		try:
			total = flt(r.rounded_total or r.grand_total)
			qz_print_update(r.name)
			make_invoice(
				customer=r.customer, payments=[{"mode_of_payment": modes[0], "amount": total}],
				cashier="Administrator", pos_profile=r.pos_profile, owner="Administrator",
				additionalDiscount=None, table=r.restaurant_table, invoice=r.name,
			)
			frappe.db.commit()
			done.append(r.name)
		except Exception as e:
			frappe.db.rollback()
			failed.append(f"{r.name}: {str(e)[:120]}")
	out = {"settled": len(done), "failed": failed[:5], "failed_count": len(failed),
		"occupied_tables": frappe.db.count("URY Table", {"occupied": 1})}
	print(out)
	return out
