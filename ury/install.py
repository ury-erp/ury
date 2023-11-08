import click

from ury.setup import after_install as setup


def after_install():
    try:
        print("Setting up URY...")
        setup()
        
        click.secho("Thank you for installing URY App!", fg="green")

        
    except:
        pass
     
