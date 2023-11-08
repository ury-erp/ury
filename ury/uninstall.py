import click

from ury.setup import before_uninstall as remove_custom_fields


def before_uninstall():
    try:
        print("Removing customizations created by the Frappe URY app...")
        # remove_custom_fields()

    except:
        print("Failed To Remove Customizations.")
