"""Serve staff PWA helpers: SW response headers and source loading."""

from __future__ import annotations

from pathlib import Path

# Canonical SW URL under the app scope (preferred registration URL).
SERVE_SW_PATH = "/ury/serve/sw.js"
SERVE_SCOPE = "/ury/serve/"

# www page route for the worker (also reachable as /serve-sw.js).
SERVE_SW_PAGE = "serve-sw.js"

_SERVE_SW_PATHS = frozenset(
	{
		"/ury/serve/sw.js",
		"/serve-sw.js",
		"/serve-sw",
		"ury/serve/sw.js",
		"serve-sw.js",
		"serve-sw",
	}
)


def after_request(response=None, request=None):
	"""Tag successful Serve SW responses with scope + JS content-type.

	Skips error/login HTML (and other non-success bodies) so they are never
	mislabeled as application/javascript.
	"""
	if response is None or request is None:
		return response

	raw = request.path or ""
	# Keep .js extension; only strip a trailing slash.
	path = raw[:-1] if raw.endswith("/") and raw != "/" else raw
	normalized = path if path.startswith("/") else f"/{path}"
	if normalized not in _SERVE_SW_PATHS and path not in _SERVE_SW_PATHS:
		return response

	status = int(getattr(response, "status_code", None) or 200)
	if status >= 400:
		return response

	existing = _response_content_type(response).lower()
	if "text/html" in existing or "application/json" in existing:
		return response

	response.headers["Service-Worker-Allowed"] = SERVE_SCOPE
	response.headers["Content-Type"] = "application/javascript; charset=utf-8"
	response.headers["Cache-Control"] = "no-cache"
	return response


def service_worker_source_candidates(app_path: Path | None = None) -> list[Path]:
	"""Built public asset first, then workspace serve/public source."""
	root = app_path or _ury_app_path()
	return [
		root / "public" / "serve" / "sw.js",
		root.parent / "serve" / "public" / "sw.js",
	]


def load_service_worker_source(app_path: Path | None = None) -> str:
	"""Return the Serve SW JavaScript body from disk."""
	for path in service_worker_source_candidates(app_path):
		if path.is_file():
			return path.read_text(encoding="utf-8")
	raise FileNotFoundError(
		"Serve service worker source not found (expected serve/public/sw.js or ury/public/serve/sw.js)"
	)


def _response_content_type(response) -> str:
	mimetype = getattr(response, "mimetype", None) or ""
	headers = getattr(response, "headers", None)
	header_type = ""
	if headers is not None:
		try:
			header_type = headers.get("Content-Type") or ""
		except Exception:
			header_type = ""
	return f"{mimetype};{header_type}"


def _ury_app_path() -> Path:
	import frappe

	return Path(frappe.get_app_path("ury"))
