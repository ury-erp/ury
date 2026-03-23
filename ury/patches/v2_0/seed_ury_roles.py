import frappe


def execute():
	"""Seed URY roles and capabilities after model sync."""
	from ury.install import create_ury_roles
	print("Seeding URY roles and capabilities...")
	create_ury_roles()
