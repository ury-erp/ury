"""Recipes and the consumption they drive: validation, costing, warehouses, and the never-block rule."""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import consumption, recipes

R = "ury.ury.api.recipes"
C = "ury.ury.api.consumption"


class Obj:
	def __init__(self, **kw):
		self.__dict__.update(kw)

	def get(self, key, default=None):
		return self.__dict__.get(key, default)


class TestRecipeValidation(FrappeTestCase):

	def _validate(self, rows, items=None, whole=(), conversions=None, kits=None):
		items = items or {
			"ORANGE": frappe._dict(name="ORANGE", item_name="Orange", stock_uom="Nos", is_stock_item=1, disabled=0, has_variants=0),
			"TOBACCO": frappe._dict(name="TOBACCO", item_name="Tobacco", stock_uom="Kg", is_stock_item=1, disabled=0, has_variants=0),
			"KIT": frappe._dict(name="KIT", item_name="Kit", stock_uom="Nos", is_stock_item=0, disabled=0, has_variants=0),
		}
		conversions = conversions or {("TOBACCO", "Gram"): 0.001}
		with patch(f"{R}.frappe.db.get_value", side_effect=lambda dt, name, *a, **k: items.get(name)), \
			 patch(f"{R}._whole_number", side_effect=lambda uom: uom in whole), \
			 patch(f"{R}._default_boms", side_effect=lambda codes: {c: frappe._dict(name=f"BOM-{c}") for c in codes if c in (kits or {})}), \
			 patch(f"{R}._explode_items", side_effect=lambda bom: (kits or {}).get(bom.replace("BOM-", ""), [])), \
			 patch("erpnext.stock.get_item_details.get_conversion_factor",
				   side_effect=lambda code, uom: {"conversion_factor": 1.0 if uom == items[code].stock_uom else conversions.get((code, uom))}):
			return recipes._validate_lines("JUICE", rows)

	def assertRefused(self, text, *args, **kwargs):
		with self.assertRaises(frappe.ValidationError) as ctx:
			self._validate(*args, **kwargs)
		self.assertIn(text, str(ctx.exception))

	def test_grams_of_an_ingredient_kept_in_kilos(self):
		lines = self._validate([{"item_code": "TOBACCO", "qty": 50, "uom": "Gram"}])
		self.assertAlmostEqual(lines[0].conversion_factor, 0.001)

	def test_a_recipe_needs_ingredients(self):
		self.assertRefused("Add at least one ingredient", [])

	def test_a_product_cannot_contain_itself(self):
		items = {"JUICE": frappe._dict(name="JUICE", item_name="Juice", stock_uom="Nos", is_stock_item=0, disabled=0, has_variants=0)}
		self.assertRefused("ingredient of itself", [{"item_code": "JUICE", "qty": 1}], items=items)

	def test_an_ingredient_is_listed_once(self):
		self.assertRefused("listed twice", [{"item_code": "ORANGE", "qty": 1}, {"item_code": "ORANGE", "qty": 2}])

	def test_zero_quantity_is_refused(self):
		self.assertRefused("greater than zero", [{"item_code": "ORANGE", "qty": 0}])

	def test_half_an_orange_counted_in_whole_units_is_refused(self):
		# A stock entry rejects 1.5 Nos; better to say so while the recipe is written.
		self.assertRefused("whole", [{"item_code": "ORANGE", "qty": 0.5, "uom": "Nos"}], whole=("Nos",))

	def test_a_unit_without_a_conversion_is_refused(self):
		self.assertRefused("no conversion", [{"item_code": "ORANGE", "qty": 1, "uom": "Kg"}])

	def test_a_non_stock_ingredient_needs_its_own_recipe(self):
		self.assertRefused("cannot be deducted", [{"item_code": "KIT", "qty": 1}])

	def test_a_kit_with_its_own_recipe_is_accepted(self):
		lines = self._validate([{"item_code": "KIT", "qty": 1}], kits={"KIT": [frappe._dict(item_code="ORANGE")]})
		self.assertEqual(lines[0].item_code, "KIT")

	def test_a_kit_that_contains_the_product_is_a_loop(self):
		self.assertRefused("cannot contain itself", [{"item_code": "KIT", "qty": 1}],
						   kits={"KIT": [frappe._dict(item_code="JUICE")]})


class TestExplode(FrappeTestCase):

	def _bom(self, name, rows, quantity=1):
		return Obj(name=name, quantity=quantity, items=[frappe._dict(r) for r in rows])

	def test_quantities_scale_with_portions_sold(self):
		bom = self._bom("B1", [{"item_code": "ORANGE", "stock_qty": 3, "source_warehouse": None}])
		with patch(f"{R}.frappe.get_cached_doc", return_value=bom), \
			 patch(f"{R}.frappe.get_cached_value", return_value=1):
			rows = recipes.explode("B1", 2, "Bar")
		self.assertEqual(rows[0].qty, 6)
		self.assertEqual(rows[0].warehouse, "Bar")

	def test_a_line_warehouse_wins_over_the_default(self):
		bom = self._bom("B1", [{"item_code": "ORANGE", "stock_qty": 1, "source_warehouse": "Cold Store"}])
		with patch(f"{R}.frappe.get_cached_doc", return_value=bom), \
			 patch(f"{R}.frappe.get_cached_value", return_value=1):
			self.assertEqual(recipes.explode("B1", 1, "Bar")[0].warehouse, "Cold Store")

	def test_kits_are_opened_up(self):
		boms = {
			"HOOKAH": self._bom("HOOKAH", [{"item_code": "HEAD-KIT", "stock_qty": 1, "source_warehouse": None}]),
			"KITBOM": self._bom("KITBOM", [{"item_code": "FOIL", "stock_qty": 2, "source_warehouse": None}]),
		}
		stock = {"HEAD-KIT": 0, "FOIL": 1}
		with patch(f"{R}.frappe.get_cached_doc", side_effect=lambda dt, name: boms[name]), \
			 patch(f"{R}.frappe.get_cached_value", side_effect=lambda dt, name, field: stock[name]), \
			 patch(f"{R}._default_boms", return_value={"HEAD-KIT": frappe._dict(name="KITBOM")}):
			rows = recipes.explode("HOOKAH", 3)
		self.assertEqual([(r.item_code, r.qty) for r in rows], [("FOIL", 6)])


class TestCost(FrappeTestCase):

	def test_stock_in_the_warehouse_is_priced_at_its_valuation(self):
		with patch(f"{R}.frappe.db.get_value", return_value=frappe._dict(actual_qty=5, valuation_rate=250)):
			self.assertEqual(recipes.ingredient_unit_cost("ORANGE", "Bar"), {"rate": 250, "source": "warehouse"})

	def test_out_of_stock_falls_back_to_the_last_purchase(self):
		with patch(f"{R}.frappe.db.get_value", return_value=None), \
			 patch(f"{R}.frappe.db.sql", return_value=[(None, None)]), \
			 patch(f"{R}._last_purchases", return_value={"ORANGE": {"rate": 300}}):
			self.assertEqual(recipes.ingredient_unit_cost("ORANGE", "Bar"), {"rate": 300, "source": "purchase"})

	def test_never_bought_is_unknown_not_free(self):
		with patch(f"{R}.frappe.db.get_value", return_value=None), \
			 patch(f"{R}.frappe.db.sql", return_value=[(None, None)]), \
			 patch(f"{R}._last_purchases", return_value={}), \
			 patch(f"{R}.frappe.get_cached_value", return_value=1):
			self.assertEqual(recipes.ingredient_unit_cost("SAFFRON", "Bar")["source"], "none")


class TestConsumptionLog(FrappeTestCase):

	def _invoice(self, lines, is_return=0):
		return Obj(name="POS-1", company="C1", branch="B1", pos_profile="P1", posting_date="2026-10-03",
				   posting_time="12:00:00", is_return=is_return, set_warehouse=None,
				   items=[Obj(item_code=c, qty=q, stock_qty=q, conversion_factor=1, warehouse=None) for c, q in lines])

	def _build(self, invoice, stock_items=(), recipes_=None):
		inserted = []

		def get_doc(arg, *a, **k):
			doc = MagicMock()
			doc.update(arg if isinstance(arg, dict) else {})
			doc.items = [frappe._dict(r) for r in arg["items"]] if isinstance(arg, dict) else []
			doc.insert.side_effect = lambda **kw: inserted.append(arg)
			return doc

		with patch(f"{C}.frappe.db.get_value", return_value=None), \
			 patch(f"{C}.frappe.get_all", return_value=list(stock_items)), \
			 patch(f"{C}._default_boms", return_value=recipes_ or {}), \
			 patch(f"{C}.consumption_warehouse", return_value="Bar"), \
			 patch(f"{C}.explode", side_effect=lambda bom, qty, wh: [frappe._dict(item_code="ORANGE", qty=3 * qty, warehouse=None, recipe=bom)]), \
			 patch(f"{C}.frappe.get_cached_value", return_value=None), \
			 patch(f"{C}.frappe.get_doc", side_effect=get_doc):
			log = consumption.build_log(invoice)
		return log, inserted

	def test_a_sold_product_consumes_its_recipe(self):
		_log, inserted = self._build(self._invoice([("JUICE", 2)]), recipes_={"JUICE": frappe._dict(name="BOM-J")})
		self.assertEqual(len(inserted), 1)
		row = inserted[0]["items"][0]
		self.assertEqual((row["item_code"], row["qty"], row["warehouse"]), ("ORANGE", 6, "Bar"))

	def test_a_return_gives_nothing_back(self):
		log, inserted = self._build(self._invoice([("JUICE", 1)], is_return=1), recipes_={"JUICE": frappe._dict(name="BOM-J")})
		self.assertIsNone(log)
		self.assertEqual(inserted, [])

	def test_products_without_a_recipe_consume_nothing(self):
		log, inserted = self._build(self._invoice([("WATER", 1)]))
		self.assertIsNone(log)

	def test_a_stock_item_is_never_exploded(self):
		# The sale already takes a can of cola off the shelf.
		log, _ = self._build(self._invoice([("COLA", 1)]), stock_items=["COLA"],
							 recipes_={})
		self.assertIsNone(log)

	def test_whole_units_stay_whole(self):
		with patch(f"{C}.frappe.get_cached_value", side_effect=lambda dt, name, field: "Nos" if dt == "Item" else 1):
			# Float noise is not an extra orange; a real fraction rounds up to a whole one.
			self.assertEqual(consumption._stock_qty("ORANGE", 2.0000001), 2.0)
			self.assertEqual(consumption._stock_qty("ORANGE", 2.1), 3.0)


class TestNeverBlockTheSale(FrappeTestCase):

	def test_an_error_while_recording_is_logged_not_raised(self):
		with patch(f"{C}.build_log", side_effect=Exception("boom")), \
			 patch(f"{C}.frappe.db.savepoint"), \
			 patch(f"{C}.frappe.db.rollback") as rollback, \
			 patch(f"{C}.frappe.log_error") as log_error, \
			 patch(f"{C}.frappe.enqueue") as enqueue:
			consumption.on_pos_invoice_submit(Obj(name="POS-1"))
		rollback.assert_called_once_with(save_point="ury_consumption")
		log_error.assert_called_once()
		enqueue.assert_not_called()

	def test_the_deduction_runs_after_the_sale_commits(self):
		log = Obj(name="CONS-1", status="Pending")
		with patch(f"{C}.build_log", return_value=log), \
			 patch(f"{C}.frappe.db.savepoint"), \
			 patch(f"{C}.frappe.enqueue") as enqueue:
			consumption.on_pos_invoice_submit(Obj(name="POS-1"))
		self.assertTrue(enqueue.call_args.kwargs["enqueue_after_commit"])
		self.assertEqual(enqueue.call_args.kwargs["log_name"], "CONS-1")
