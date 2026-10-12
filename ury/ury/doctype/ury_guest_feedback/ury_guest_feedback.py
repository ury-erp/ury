# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# What a guest thought, in their own words.
#
# Every number here is one a guest typed, so the only thing this document
# enforces is that it is a number they could have meant: a five-star scale
# that accepts a seven produces an average nobody can interpret.

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint

# The five-point scales. Kept together so a new aspect cannot be added with a
# different range by accident.
STAR_FIELDS = ("overall", "food", "service", "cleanliness")
MAX_STARS = 5

# The recommendation question is the standard eleven-point one, because the
# whole point of NPS is that it compares with other people's NPS.
MAX_RECOMMEND = 10

# Below this, a rating is a complaint that somebody should answer today.
DETRACTOR_AT_OR_BELOW = 2


class URYGuestFeedback(Document):
	def validate(self):
		self.validate_scales()
		self.validate_invoice_branch()

	def validate_scales(self):
		for field in STAR_FIELDS:
			value = self.get(field)
			if value in (None, ""):
				if field == "overall":
					frappe.throw(_("An overall rating is required."))
				continue
			if not 1 <= cint(value) <= MAX_STARS:
				frappe.throw(_("Ratings run from 1 to {0}.").format(MAX_STARS))

		if self.recommend_score not in (None, ""):
			if not 0 <= cint(self.recommend_score) <= MAX_RECOMMEND:
				frappe.throw(_("The recommendation score runs from 0 to {0}.").format(MAX_RECOMMEND))

	def validate_invoice_branch(self):
		if not self.invoice:
			return
		branch = frappe.db.get_value("POS Invoice", self.invoice, "branch")
		if branch and branch != self.branch:
			# The branch decides who may read this row, so it must be the
			# branch that served the meal rather than one the caller supplied.
			frappe.throw(_("The feedback branch must match the invoice's branch."))

	@property
	def is_detractor(self):
		return cint(self.overall) <= DETRACTOR_AT_OR_BELOW


def net_promoter_score(scores):
	"""NPS from recommendation answers: promoters minus detractors, as a percentage.

	Skipped answers are dropped rather than counted as zero — a guest who did
	not answer is not a guest who would never recommend you. Returns None when
	nobody answered, because 0 would read as a real and very bad score.
	"""
	answered = [cint(score) for score in scores if score not in (None, "")]
	if not answered:
		return None

	promoters = sum(1 for score in answered if score >= 9)
	detractors = sum(1 for score in answered if score <= 6)
	return round((promoters - detractors) * 100 / len(answered))
