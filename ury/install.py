import click

from ury.setup_customizations import after_install as setup


def after_install():
    # This creates URY's custom fields and grants the URY roles. Failing
    # silently here used to leave a half-configured site reporting a
    # successful install, so the error is surfaced and re-raised — bench
    # rolls the install back rather than handing over a broken site.
    print("Setting up URY...")
    try:
        setup()
    except Exception:
        click.secho("URY setup failed — the app is not fully configured.", fg="red")
        raise

    click.secho("Thank you for installing URY App!", fg="green")
