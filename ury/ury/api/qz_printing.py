"""Printing through QZ Tray: one print station per branch, many printers.

QZ Tray runs on a computer at the restaurant (usually the cashier's) and
prints to the printers installed on it — the bill printer and each kitchen's
ticket printer. The server cannot reach that computer, so printing works as
a queue:

1. The server writes a URY Print Job (a kitchen ticket when a KOT is
   submitted, a bill when someone reprints from the dashboard).
2. Every POS screen at the branch that has QZ enabled runs a small agent; it
   is nudged over realtime and also polls, then *claims* pending jobs. The
   claim is one atomic UPDATE, so with two screens open a job prints once.
3. The agent prints the rendered HTML on the named printer through QZ and
   reports back; failures stay visible and can be retried from the dashboard.

Signing: QZ only prints silently for a site whose certificate it trusts. The
private key stays on the server (site private folder) and the POS asks
`ury_print.signature_promise` to sign; the certificate is served by
`get_certificate` and installed once on the station as QZ's override.crt.
"""

import datetime
import os

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, now_datetime

from ury.ury.api.invoice_activity import log_activity

CLAIM_TIMEOUT_SECONDS = 120   # a claim older than this is assumed lost (tab closed mid-print)
MAX_ATTEMPTS = 3
SETUP_ROLES = {"System Manager", "URY Admin", "URY Manager", "Administrator"}
KITCHEN_TICKET_FORMAT = "URY Kitchen Ticket"
KEY_FILE = os.path.join("qz", "private-key.pem")


# ---------------------------------------------------------------------------
# Setup (dashboard "Printers" page)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_setup(branch):
    _require_setup_role()
    profile = _branch_profile(branch)
    kitchens = frappe.get_all(
        "URY Production Unit", filters={"branch": branch}, fields=["name", "qz_printer"], order_by="name"
    )
    jobs = {
        row.status: row.count
        for row in frappe.get_all(
            "URY Print Job",
            filters={"branch": branch, "status": ["in", ["Pending", "Claimed", "Failed"]]},
            fields=["status", "count(name) as count"],
            group_by="status",
        )
    }
    return {
        "pos_profile": profile.name if profile else None,
        "qz_enabled": cint(profile.qz_print) if profile else 0,
        "qz_host": (profile.qz_host if profile else None) or "localhost",
        "bill_printer": profile.get("custom_qz_bill_printer") if profile else None,
        "kitchens": kitchens,
        "certificate_ready": bool(_certificate()) and bool(_private_key_path()),
        "queue": {"pending": jobs.get("Pending", 0) + jobs.get("Claimed", 0), "failed": jobs.get("Failed", 0)},
        "failed_jobs": frappe.get_all(
            "URY Print Job",
            filters={"branch": branch, "status": "Failed"},
            fields=["name", "reference_doctype", "reference_name", "printer", "error", "modified"],
            order_by="modified desc",
            limit=10,
        ),
    }


@frappe.whitelist()
def save_setup(branch, qz_enabled, qz_host=None, bill_printer=None, kitchens=None):
    _require_setup_role()
    profiles = _branch_profiles(branch)
    if not profiles:
        frappe.throw(_("No POS Profile is set up for this branch"))

    # Every restaurant till of the branch prints through the same station.
    # Only these fields are written: a full save would re-run ERPNext's POS
    # Profile validation, which can fail on settings unrelated to printing.
    for name in profiles:
        frappe.db.set_value("POS Profile", name, {
            "qz_print": cint(qz_enabled),
            "qz_host": (qz_host or "").strip() or "localhost",
            "custom_qz_bill_printer": (bill_printer or "").strip() or None,
        })

    for row in frappe.parse_json(kitchens or "[]"):
        unit = frappe.get_doc("URY Production Unit", row.get("name"))
        if unit.branch != branch:
            frappe.throw(_("Kitchen {0} does not belong to branch {1}").format(unit.name, branch))
        unit.qz_printer = (row.get("qz_printer") or "").strip() or None
        unit.save()
    return get_setup(branch)


@frappe.whitelist()
def get_certificate():
    """The public certificate QZ Tray must trust (safe to share)."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    return _certificate()


@frappe.whitelist()
def generate_certificate(force=0):
    """Create the site's QZ signing key and certificate, once.

    The key is written to the site's private folder and never served; the
    certificate goes to site config. Regenerating invalidates the copy
    installed on every print station, hence the explicit `force`.
    """
    _require_setup_role()
    if _certificate() and _private_key_path() and not cint(force):
        return _certificate()

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    from frappe.installer import update_site_config

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, frappe.local.site),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Smart Restro"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365 * 10))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    key_path = frappe.get_site_path("private", KEY_FILE)
    os.makedirs(os.path.dirname(key_path), exist_ok=True)
    with open(key_path, "wb") as fh:
        fh.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
    os.chmod(key_path, 0o600)

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    update_site_config("qz_private_key", KEY_FILE)
    update_site_config("qz_cert", cert_pem)
    frappe.local.conf.qz_private_key = KEY_FILE
    frappe.local.conf.qz_cert = cert_pem
    return cert_pem


@frappe.whitelist()
def test_print(branch, printer):
    """Queue a one-line test page, to check a printer end to end."""
    _require_setup_role()
    if not (printer or "").strip():
        frappe.throw(_("Choose a printer first"))
    job = frappe.get_doc({
        "doctype": "URY Print Job",
        "branch": branch,
        "printer": printer.strip(),
        "reference_doctype": "Branch",
        "reference_name": branch,
        "print_format": None,
    }).insert(ignore_permissions=True)
    _nudge(branch)
    return job.name


@frappe.whitelist()
def retry_failed(branch, job=None):
    _require_setup_role()
    filters = {"branch": branch, "status": "Failed"}
    if job:
        filters["name"] = job
    for name in frappe.get_all("URY Print Job", filters=filters, pluck="name"):
        frappe.db.set_value("URY Print Job", name, {"status": "Pending", "attempts": 0, "error": None, "claimed_by": None})
    _nudge(branch)


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

def enqueue(branch, printer, reference_doctype, reference_name, print_format=None):
    """Add a print to the branch's QZ queue and wake its station. Never raises."""
    try:
        frappe.get_doc({
            "doctype": "URY Print Job",
            "branch": branch,
            "printer": printer,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
            "print_format": print_format,
        }).insert(ignore_permissions=True)
        frappe.db.after_commit.add(lambda: _nudge(branch))
        return True
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Could not queue QZ print")
        return False


def branch_uses_qz(pos_profile):
    return bool(pos_profile) and bool(cint(frappe.db.get_value("POS Profile", pos_profile, "qz_print")))


def queue_kot(kot):
    """Queue a submitted KOT on its kitchen's QZ printer.

    Returns True when the ticket is handled here (so network printing is
    skipped), False when this kitchen has no QZ printer and the old path
    should run.
    """
    if not kot.production or not branch_uses_qz(kot.pos_profile):
        return False
    printer = frappe.db.get_value("URY Production Unit", kot.production, "qz_printer")
    if not printer:
        return False
    return enqueue(kot.branch, printer, "URY KOT", kot.name, KITCHEN_TICKET_FORMAT)


def queue_bill(invoice):
    """Queue a POS Invoice on its branch's QZ bill printer. Raises if not set up."""
    doc = frappe.get_doc("POS Invoice", invoice)
    if not branch_uses_qz(doc.pos_profile):
        frappe.throw(_("QZ printing is not enabled for this branch"))
    printer = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_qz_bill_printer")
    if not printer:
        frappe.throw(_("Choose the bill printer on the Printers page first"))
    fmt = frappe.db.get_value("POS Profile", doc.pos_profile, "print_format") or "POS Invoice"
    enqueue(doc.branch, printer, "POS Invoice", doc.name, fmt)


@frappe.whitelist()
def claim_jobs(branch, station, limit=10):
    """Claim pending jobs for this station and return them ready to print.

    One UPDATE marks the rows with this station's id; only rows that UPDATE
    actually changed come back, so two stations never print the same job.
    """
    _require_station_role()
    station = (station or "")[:140]
    stale = add_to_date(now_datetime(), seconds=-CLAIM_TIMEOUT_SECONDS)
    frappe.db.sql(
        """
        UPDATE `tabURY Print Job`
        SET status = 'Claimed', claimed_by = %(station)s, claimed_at = %(now)s, attempts = attempts + 1
        WHERE branch = %(branch)s AND attempts < %(max)s
          AND (status = 'Pending' OR (status = 'Claimed' AND claimed_at < %(stale)s))
        ORDER BY creation
        LIMIT %(limit)s
        """,
        {"station": station, "now": now_datetime(), "branch": branch, "max": MAX_ATTEMPTS,
         "stale": stale, "limit": min(cint(limit) or 10, 25)},
    )
    jobs = frappe.get_all(
        "URY Print Job",
        filters={"branch": branch, "status": "Claimed", "claimed_by": station},
        fields=["name", "printer", "reference_doctype", "reference_name", "print_format"],
        order_by="creation",
    )
    # Jobs that ran out of attempts while claimed elsewhere are failures, not limbo.
    frappe.db.sql(
        """UPDATE `tabURY Print Job` SET status = 'Failed', error = IFNULL(error, %s)
           WHERE branch = %s AND status = 'Claimed' AND attempts >= %s AND claimed_at < %s""",
        (_("The print station did not confirm this print"), branch, MAX_ATTEMPTS, stale),
    )
    frappe.db.commit()
    return [dict(job, html=_render(job)) for job in jobs]


@frappe.whitelist()
def complete_job(job, ok, error=None):
    _require_station_role()
    doc = frappe.get_doc("URY Print Job", job)
    if cint(ok):
        doc.db_set({"status": "Printed", "printed_at": now_datetime(), "error": None})
        if doc.reference_doctype == "POS Invoice":
            already = cint(frappe.db.get_value("POS Invoice", doc.reference_name, "invoice_printed"))
            if not already:
                frappe.db.set_value("POS Invoice", doc.reference_name, "invoice_printed", 1, update_modified=False)
            log_activity(doc.reference_name, (_("Bill reprinted {0}") if already else _("Bill printed {0}")).format(
                _("on {0}").format(doc.printer)))
    else:
        status = "Failed" if doc.attempts >= MAX_ATTEMPTS else "Pending"
        doc.db_set({"status": status, "error": (error or "")[:1000], "claimed_by": None})


# ---------------------------------------------------------------------------

def _render(job):
    if job.reference_doctype == "Branch":
        return (
            '<div style="font-family:Tahoma,Arial;direction:rtl;text-align:center;width:72mm;padding:4mm">'
            f'<h2 style="margin:0">{frappe.utils.escape_html(_("Test page"))}</h2>'
            f'<p>{frappe.utils.escape_html(job.printer)}</p>'
            f'<p>{frappe.utils.format_datetime(now_datetime())}</p></div>'
        )
    from frappe.www.printview import get_html_and_style

    out = get_html_and_style(
        doc=job.reference_doctype,
        name=job.reference_name,
        print_format=job.print_format,
        no_letterhead=1,
        letterhead="No Letterhead",
        settings={},
    )
    return f"<style>{out.get('style') or ''}</style>{out.get('html') or ''}"


def _nudge(branch):
    frappe.publish_realtime(f"ury_print_jobs_{branch}", {"branch": branch})


def _branch_profiles(branch):
    """The branch's restaurant tills (POS Profiles linked to a URY Restaurant)."""
    names = frappe.get_all(
        "POS Profile",
        filters={"branch": branch, "disabled": 0, "restaurant": ["is", "set"]},
        pluck="name",
        order_by="modified desc",
    )
    return names or frappe.get_all(
        "POS Profile", filters={"branch": branch, "disabled": 0}, pluck="name", order_by="modified desc"
    )


def _branch_profile(branch):
    names = _branch_profiles(branch)
    if not names:
        return None
    name = names[0]
    return frappe.db.get_value(
        "POS Profile", name, ["name", "qz_print", "qz_host", "custom_qz_bill_printer"], as_dict=True
    )


def _certificate():
    return (frappe.get_site_config().get("qz_cert") or "").strip()


def _private_key_path():
    value = (frappe.get_site_config().get("qz_private_key") or "").strip()
    if value.startswith("-----BEGIN"):
        return value
    return value if value and os.path.exists(frappe.get_site_path("private", value)) else ""


def _require_setup_role():
    if not SETUP_ROLES.intersection(frappe.get_roles()):
        frappe.throw(_("Not permitted"), frappe.PermissionError)


def _require_station_role():
    from ury.ury.api.ury_print import QZ_SIGNING_ROLES

    if frappe.session.user == "Guest" or not QZ_SIGNING_ROLES.intersection(frappe.get_roles()):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
