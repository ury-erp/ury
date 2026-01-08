import click

from ury.setup import before_uninstall as remove_custom_fields


def before_uninstall():
    try:
        print("Removing URY custom fields...")
        remove_custom_fields()
              
    except:
        pass
    
def after_uninstall():
    print("URY App uninstalled successfully.")
