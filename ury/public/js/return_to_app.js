/**
 * "Back to <App>" bridge for users who leave a URY SPA for the Frappe desk.
 *
 * URY ships several standalone SPAs (`/ury`, `/pos`, `/mosaic`, `/urypos`,
 * `/order`). Some functionality is not migrated to them yet, so screens link
 * out to a desk form (e.g. `/ury/wastage` -> `/app/ury-issue-wastage/WST-0001`).
 * Once in the desk the user is stranded: the desk has no idea an SPA sent them,
 * and the browser Back button is unreliable after the desk router rewrites the
 * URL and the user navigates within the desk.
 *
 * This script closes that loop. The SPA appends `ury_return_to` (a same-origin
 * path) and `ury_return_label` (the app's display name) to the desk URL --
 * see `packages/core/src/frappe/deskLink.ts::buildDeskUrl`. Here we:
 *
 *   1. Read those params on the *very first* paint and immediately copy them
 *      into sessionStorage. This matters: Frappe's desk router owns
 *      `location.search` and drops unknown params as soon as the user moves,
 *      so the params are only readable once.
 *   2. Render a small fixed-position chip offering a one-click way back. It is
 *      appended to `document.body`, so it survives desk SPA route changes
 *      (the desk swaps `.main-section`, not `body`).
 *   3. Keep offering it for the rest of the desk session, until the user
 *      either follows it or dismisses it.
 *
 * Security: the return path is turned into an `href`, so an unvalidated value
 * would be an open redirect. `isAllowedReturnPath()` below accepts only
 * same-origin absolute paths under a known URY app prefix -- it mirrors
 * `RETURN_TO_ALLOWED_PREFIXES` in `packages/core/src/frappe/deskLink.ts`; keep
 * the two in sync.
 */
(() => {
	const RETURN_PARAM = "ury_return_to";
	const LABEL_PARAM = "ury_return_label";
	const STORAGE_KEY = "ury:desk_return_to";
	const ELEMENT_ID = "ury-return-to-app";

	// Mirrors RETURN_TO_ALLOWED_PREFIXES in packages/core/src/frappe/deskLink.ts.
	const ALLOWED_PREFIXES = ["/ury", "/pos", "/mosaic", "/urypos", "/order"];

	/**
	 * Accepts only a same-origin absolute path under a known URY app.
	 * Rejects absolute URLs, protocol-relative `//host` (and the `/\` variant
	 * some browsers normalise to it), and anything outside the allowlist.
	 */
	const isAllowedReturnPath = (path) => {
		if (typeof path !== "string" || !path || path.length > 512) return false;
		if (path[0] !== "/") return false;
		if (path.startsWith("//") || path.startsWith("/\\")) return false;
		return ALLOWED_PREFIXES.some(
			(prefix) =>
				path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?")
		);
	};

	/** Strip anything that could smuggle markup into the chip's text. */
	const sanitizeLabel = (label) => {
		if (typeof label !== "string") return "URY";
		const cleaned = label.replace(/[^\w\s()&-]/g, "").trim();
		return cleaned.slice(0, 32) || "URY";
	};

	const readSession = (key) => {
		try {
			return window.sessionStorage.getItem(key);
		} catch (e) {
			// Private mode / disabled storage: the chip is a nicety, not a
			// requirement. Degrade to "params only, this page only".
			return null;
		}
	};

	const writeSession = (key, value) => {
		try {
			if (value === null) window.sessionStorage.removeItem(key);
			else window.sessionStorage.setItem(key, value);
		} catch (e) {
			/* ignore */
		}
	};

	/**
	 * Capture the return context from the URL if present, otherwise fall back
	 * to whatever an earlier desk page in this session already captured.
	 */
	const resolveContext = () => {
		let params;
		try {
			params = new URLSearchParams(window.location.search);
		} catch (e) {
			params = null;
		}

		const fromUrl = params && params.get(RETURN_PARAM);
		if (isAllowedReturnPath(fromUrl)) {
			const context = { path: fromUrl, label: sanitizeLabel(params.get(LABEL_PARAM)) };
			writeSession(STORAGE_KEY, JSON.stringify(context));
			return context;
		}

		const stored = readSession(STORAGE_KEY);
		if (!stored) return null;
		try {
			const context = JSON.parse(stored);
			if (!isAllowedReturnPath(context && context.path)) {
				writeSession(STORAGE_KEY, null);
				return null;
			}
			return { path: context.path, label: sanitizeLabel(context.label) };
		} catch (e) {
			writeSession(STORAGE_KEY, null);
			return null;
		}
	};

	const render = (context) => {
		if (document.getElementById(ELEMENT_ID)) return;

		const wrapper = document.createElement("div");
		wrapper.id = ELEMENT_ID;
		wrapper.setAttribute("role", "complementary");
		wrapper.setAttribute("aria-label", "Return to " + context.label);
		wrapper.style.cssText = [
			"position:fixed",
			// Bottom-left: the desk keeps its own floating widgets (form
			// footer actions, notification toasts) bottom-right.
			"left:16px",
			"bottom:16px",
			"z-index:1050",
			"display:flex",
			"align-items:center",
			"gap:2px",
			"padding:4px 4px 4px 12px",
			"border-radius:999px",
			"background:var(--bg-color, #fff)",
			"border:1px solid var(--border-color, #d8dfe7)",
			"box-shadow:0 4px 16px rgba(0,0,0,0.14)",
			"font-size:12px",
			"line-height:1.4",
			"max-width:calc(100vw - 32px)",
		].join(";");

		const link = document.createElement("a");
		link.href = context.path;
		link.textContent = "← Back to " + context.label;
		link.style.cssText = [
			"color:var(--text-color, #1f272e)",
			"font-weight:500",
			"text-decoration:none",
			"white-space:nowrap",
			"overflow:hidden",
			"text-overflow:ellipsis",
			"padding:4px 4px",
		].join(";");
		link.addEventListener("click", () => writeSession(STORAGE_KEY, null));

		const dismiss = document.createElement("button");
		dismiss.type = "button";
		dismiss.setAttribute("aria-label", "Dismiss return link");
		dismiss.textContent = "×";
		dismiss.style.cssText = [
			"border:0",
			"background:transparent",
			"cursor:pointer",
			"color:var(--text-muted, #7a8592)",
			"font-size:15px",
			"line-height:1",
			"padding:5px 8px",
			"border-radius:999px",
		].join(";");
		dismiss.addEventListener("click", () => {
			writeSession(STORAGE_KEY, null);
			wrapper.remove();
		});

		wrapper.appendChild(link);
		wrapper.appendChild(dismiss);
		document.body.appendChild(wrapper);
	};

	const init = () => {
		const context = resolveContext();
		if (context) render(context);
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
