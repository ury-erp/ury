# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""kot_execute with decimal quantities: new, increase, decrease, removal,
repeated calls and float subtraction residue. Mock-based, no database."""

import unittest
from unittest.mock import MagicMock, patch
import frappe
from ury.ury.api import ury_kot_generate as g
G="ury.ury.api.ury_kot_generate"

def run(cur, prev):
    with patch(f"{G}.frappe.get_doc") as gd, patch(f"{G}.frappe.has_permission", return_value=True), \
         patch(f"{G}.frappe.get_precision", return_value=3), \
         patch(f"{G}.process_items_for_kot", return_value=["K"]) as pk, \
         patch(f"{G}.process_items_for_cancel_kot", return_value=["C"]) as pc, \
         patch("ury.ury.api.ury_waiter_print.print_combined_waiter_order_slip"):
        gd.return_value.custom_kot_naming_series = "KOT-"
        g.kot_execute("INV","c","T1",cur,prev,"")
    pos = pk.call_args[0][3] if pk.called else []
    neg = pc.call_args[0][3] if pc.called else []
    return pos, neg

def it(q, code="I1", c=""):
    return {"item_code": code, "item_name": code, "qty": q, "comment": c}

class T(unittest.TestCase):
    def test_new_decimal(self):
        p,n = run([it(1.5)],[]); self.assertEqual(p[0]["qty"],1.5); self.assertEqual(n,[])
    def test_increase_decimal(self):
        p,n = run([it(2.75)],[it(1.5)]); self.assertAlmostEqual(p[0]["qty"],1.25); self.assertEqual(n,[])
    def test_decrease_decimal(self):
        p,n = run([it(0.25)],[it(1.5)]); self.assertAlmostEqual(n[0]["qty"],-1.25); self.assertEqual(p,[])
    def test_full_removal(self):
        p,n = run([],[it(1.5)]); self.assertEqual(n[0]["qty"],-1.5)
    def test_string_qty(self):
        p,n = run([it("2.5")],[it("1")]); self.assertAlmostEqual(p[0]["qty"],1.5)
    def test_repeat_same_state_no_kot(self):
        p,n = run([it(1.5)],[it(1.5)]); self.assertEqual((p,n),([],[]))
    def test_repeat_sequence(self):
        state=[]
        for q in (1.5, 2.5, 2.5, 1.0, 1.0):
            cur=[it(q)]; p,n=run(cur,state); state=cur
        self.assertEqual((p,n),([],[]))
    def test_integer_compat(self):
        p,n = run([it(3)],[it(1)]); self.assertEqual(p[0]["qty"],2)
        p,n = run([it(1)],[it(3)]); self.assertEqual(n[0]["qty"],-2)
    def test_two_lines_same_item(self):
        p,n = run([it(1.5,c="a"),it(0.5,c="b")],[it(1.5,c="a"),it(1.0,c="b")])
        self.assertEqual(p,[]); self.assertAlmostEqual(n[0]["qty"],-0.5)
    def test_float_residue_spurious_kot(self):
        p,n = run([it(0.3)],[it(0.1+0.2)])
        self.assertEqual((p,n),([],[]), "float residue produces spurious KOT")
if __name__=="__main__": unittest.main()
