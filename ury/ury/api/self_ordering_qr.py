"""Per-table self-ordering QR codes, rendered where staff actually need them.

`generate_qr_token` has always been able to mint a table's ordering token, but
nothing rendered it. Getting a code onto a table meant a console session, a
copy-pasted token and an external QR generator — so in practice the feature
shipped without the one artefact it depends on.

This module turns a table into a scannable, printable code from the URY Table
form itself. It deliberately does not store the image: the token is a pure
function of the profile, the table and the signing secret, so a stored PNG is
a cache that goes stale the moment the secret is rotated, silently, while the
laminated card on the table keeps pointing at a dead link.
"""

import io
import ipaddress
from urllib.parse import urlparse

import frappe
from frappe import _

from ury.ury.api.self_ordering import generate_qr_token

# Error correction level. 'M' recovers ~15% of a damaged symbol, which is the
# right trade for a card that lives on a restaurant table: high enough to
# survive a scuffed laminate, low enough to keep the symbol coarse. The token
# is already ~110 characters, and 'Q' or 'H' would push the module count high
# enough that a phone camera struggles at table distance.
ERROR_CORRECTION = "M"

# Quiet zone in modules. The spec requires 4; anything less and scanners that
# rely on the border to find the symbol fail on a busy printed card.
QUIET_ZONE = 4

SVG_SCALE = 6
PNG_SCALE = 10


def _resolve_profile(table_doc):
    """The self-ordering profile whose QR this table should carry.

    A branch is expected to have one enabled profile with table ordering on.
    If it has several, the oldest wins rather than an arbitrary row, so the
    same table does not change its code between two calls — a code that
    changes is a code that has to be reprinted.
    """
    profiles = frappe.get_all(
        "URY Self Ordering Profile",
        filters={
            "branch": table_doc.branch,
            "enabled": 1,
            "enable_qr_table_ordering": 1,
        },
        pluck="name",
        order_by="creation asc",
        limit=1,
    )
    return profiles[0] if profiles else None


def _unavailable(table, reason):
    return {
        "table": table,
        "available": False,
        "reason": reason,
        "profile": None,
        "url": None,
        "svg": None,
        "warning": None,
    }


def _url_warning(url):
    """Explain why a customer's phone will not open this link.

    A code is only ever scanned away from the desk, on a phone that is not
    on the restaurant's LAN and has no idea what the server's internal
    address is. The address baked into the symbol comes from `get_url()`,
    which falls back to whatever host the staff member happened to be
    browsing the desk on — so a perfectly valid code routinely points
    somewhere no customer can reach, and nothing says so until a few hundred
    cards have been printed and a customer is standing there with
    ERR_CONNECTION_REFUSED.

    Returns a message to show beside the code, or None when the address
    looks like something the outside world can resolve.
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""

    is_ip = False
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        pass

    if is_ip:
        return _(
            "This code points at the raw address {0}, not a domain name. Customer "
            "phones are not on this network and cannot open it. Set \"host_name\" "
            "in the site config to the public address of this site, then reload "
            "this page before printing."
        ).format(url)

    if parsed.port and parsed.port not in (80, 443):
        return _(
            "This code points at port {0}, which is normally closed to the public "
            "internet. Set \"host_name\" in the site config to the public address "
            "of this site, then reload this page before printing."
        ).format(parsed.port)

    if host in ("localhost", "127.0.0.1", "0.0.0.0"):
        return _(
            "This code points at this machine only. Set \"host_name\" in the site "
            "config to the public address of this site before printing."
        )

    return None


def _build(table):
    """Resolve a table to its ordering URL, or explain why it has none.

    Returns a payload rather than throwing for the "not configured" cases.
    This is read on every form load, and a branch that simply does not use
    self-ordering is not an error the user should meet as a red dialog.
    """
    if not frappe.has_permission("URY Table", "read", doc=table):
        frappe.throw(_("Not permitted to view this table"), frappe.PermissionError)

    table_doc = frappe.get_doc("URY Table", table)

    if not table_doc.branch:
        return _unavailable(table, _("This table is not assigned to a branch."))

    if not table_doc.enable_self_ordering:
        return _unavailable(
            table,
            _(
                "Self ordering is switched off for this table. Turn on "
                "\"Enable Self Ordering\" above to issue its code."
            ),
        )

    profile = _resolve_profile(table_doc)
    if not profile:
        return _unavailable(
            table,
            _(
                "No enabled Self Ordering Profile with QR Table Ordering was "
                "found for branch {0}."
            ).format(table_doc.branch),
        )

    # generate_qr_token carries the write-permission check on the profile,
    # which is the real gate here: minting a code is granting access to order
    # against this table. Reused rather than repeated so there is one rule.
    token = generate_qr_token(profile, table)
    url = frappe.utils.get_url(f"/order?t={token}")

    return {
        "table": table,
        "available": True,
        "reason": None,
        "profile": profile,
        # get_url() honours the site's host_name. A site left on its internal
        # hostname produces a code no customer phone can resolve, which is why
        # the form shows the URL next to the image instead of only the image.
        "url": url,
        "svg": None,
        "warning": _url_warning(url),
        "is_take_away": bool(table_doc.is_take_away),
    }


def _render_svg(url, scale=SVG_SCALE):
    import pyqrcode

    buf = io.BytesIO()
    pyqrcode.create(url, error=ERROR_CORRECTION).svg(
        buf, scale=scale, quiet_zone=QUIET_ZONE, omithw=True, xmldecl=False
    )
    return buf.getvalue().decode("utf-8")


def _render_png(url, scale=PNG_SCALE):
    import pyqrcode

    buf = io.BytesIO()
    pyqrcode.create(url, error=ERROR_CORRECTION).png(
        buf, scale=scale, quiet_zone=QUIET_ZONE
    )
    return buf.getvalue()


@frappe.whitelist()
def get_table_qr(table):
    """Ordering URL and an inline SVG for one table, for the form to render.

    SVG rather than a PNG data URI: it stays sharp at any zoom, it is a
    fraction of the bytes, and the same markup is what the print sheet uses,
    so what staff scan on screen is exactly what comes out of the printer.
    """
    payload = _build(table)
    if payload["available"]:
        payload["svg"] = _render_svg(payload["url"])
    return payload


@frappe.whitelist()
def download_table_qr(table, fmt="png"):
    """Stream one table's code as a file.

    PNG for anything that has to be placed in a design tool or sent to a print
    shop; SVG when it will be scaled, because a rescaled PNG is what turns a
    crisp symbol into an unscannable one.
    """
    fmt = (fmt or "png").lower()
    if fmt not in ("png", "svg"):
        frappe.throw(_("Unsupported format {0}").format(fmt))

    payload = _build(table)
    if not payload["available"]:
        frappe.throw(payload["reason"])

    if fmt == "svg":
        content = _render_svg(payload["url"], scale=SVG_SCALE).encode("utf-8")
        content_type = "image/svg+xml"
    else:
        content = _render_png(payload["url"])
        content_type = "image/png"

    frappe.local.response.filename = f"{table}-self-ordering-qr.{fmt}"
    frappe.local.response.filecontent = content
    frappe.local.response.type = "download"
    frappe.local.response.display_content_as = "attachment"
    frappe.local.response.content_type = content_type


@frappe.whitelist()
def get_branch_table_qrs(branch, include_takeaway=0):
    """Every table's code for one branch, for the printable sheet.

    Built in one call rather than one call per table: a branch with forty
    tables would otherwise open forty requests from a print button, and the
    sheet cannot render until the last of them lands.
    """
    if not frappe.has_permission("URY Table", "read"):
        frappe.throw(_("Not permitted to view tables"), frappe.PermissionError)

    filters = {"branch": branch}
    if not frappe.utils.cint(include_takeaway):
        filters["is_take_away"] = 0

    tables = frappe.get_all(
        "URY Table", filters=filters, pluck="name", order_by="name asc"
    )

    out = []
    for table in tables:
        payload = _build(table)
        if not payload["available"]:
            continue
        payload["svg"] = _render_svg(payload["url"])
        out.append(payload)

    if not out:
        frappe.throw(
            _("No table in branch {0} has self-ordering configured.").format(branch)
        )

    return out
