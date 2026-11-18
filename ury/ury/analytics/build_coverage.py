#!/usr/bin/env python3
"""Regenerate COVERAGE.md: metric -> dashboard/chart/level traceability for the URY restaurant solution.

Read-only over metric_dictionary.json, dashboard_portfolio.md and dashboards/DB*.yaml.
A metric counts as SHOWN only when a chart that EXISTS in a dashboard YAML is tied to it by
  (a) the chart's row in dashboard_portfolio.md (chart_id | type | METRIC-IDS | ...), or
  (b) a contiguous '#' comment block directly above the chart in the YAML naming the id
      (comment lines marked T4 / not recorded / dropped / removed are ignored).
Levels shown are inferred from the chart's grouping columns (x, rows, columns, split_by), from dashboard
filters whose applies_to names the chart's query, and (company) from the portfolio 'Levels:' line of the DB.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEVELS = ["department", "item", "category", "employee", "branch", "company"]
THEMES = ["margin", "production", "wastage", "yield", "timing", "sales", "people"]
PREFIX_THEME = {
	"MAR": "margin", "PRD": "production", "PLN": "production", "WST": "wastage", "STK": "wastage",
	"YLD": "yield", "KIT": "timing", "TBL": "timing", "SAL": "sales", "MNU": "sales", "PAY": "sales",
	"EMP": "people",
}
COL_LEVEL = {
	"branch": "branch", "company": "company",
	"department": "department", "production": "department", "production_unit": "department",
	"warehouse": "department", "kitchen_warehouse": "department",
	"item_name": "item", "item_code": "item", "item": "item",
	"menu_category": "category", "category_family": "category", "item_group": "category", "category": "category",
	"waiter": "employee", "cashier": "employee", "owner": "employee", "user": "employee", "employee": "employee",
}
FILTER_LEVEL = {
	"f_branch": "branch", "f_waiter": "employee", "f_cashier": "employee", "f_department": "department",
	"f_category": "category", "f_item": "item",
}
ID_RE = re.compile(r"\b[A-Z]{2,3}-\d{3}\b")
IGNORE_COMMENT = re.compile(r"T4|not recorded|dropped|removed|not shown|roadmap", re.I)
CHART_RE = re.compile(r"^\s*- (?:\{id|id): (db\d\d_\w+)")


def norm(s):
	s = re.sub(r"\([^)]*\)", " ", s.lower())
	s = re.sub(r"[^a-z0-9 ]+", " ", s)
	return " ".join(s.split())


def labels_of(c):
	labs = {c["title"]}
	for m in re.finditer(r'\bas: "([^"]+)"|\bas: ([^,}\]]+)', c["text"]):
		labs.add((m.group(1) or m.group(2)).strip())
	return {norm(x) for x in labs if len(norm(x)) >= 8}


def name_match(metric, c):
	"""Fallback trace: chart title / y label equals or contains the metric name AND chart query is one of the metric's source facts."""
	if c["query"] not in (metric.get("source_queries") or []):
		return False
	mn = norm(metric["name"])
	if len(mn) < 8:
		return False
	return any(l == mn or l in mn or mn in l for l in labels_of(c))


def load_dictionary():
	return json.loads((HERE / "metric_dictionary.json").read_text())


def parse_portfolio():
	"""chart_id -> metric ids; DB -> levels line tokens."""
	text = (HERE / "dashboard_portfolio.md").read_text()
	chart_metrics = {}
	for m in re.finditer(r"(db\d\d_\w+)(?: \(T\d\))? \| \w+ \| ([A-Z0-9, -]+?) \|", text):
		chart_metrics.setdefault(m.group(1), set()).update(ID_RE.findall(m.group(2)))
	db_levels = {}
	cur = None
	for line in text.splitlines():
		h = re.match(r"## (DB\d\d)\b", line)
		if h:
			cur = h.group(1)
		elif cur and line.startswith("Workbook") and "Levels:" in line:
			seg = line.split("Levels:", 1)[1].lower()
			db_levels[cur] = {lv for lv in LEVELS if lv in seg}
	return chart_metrics, db_levels


def parse_dashboard(path):
	lines = path.read_text().splitlines()
	text = "\n".join(lines)
	db = path.name[:4]
	# filters: id -> applies_to query names
	filters = {}
	for m in re.finditer(r"id: (f_\w+).*?applies_to: \{([^}]*)\}", text, re.S):
		filters[m.group(1)] = set(re.findall(r"(\w+):", m.group(2)))
	# chart blocks
	charts = []
	in_charts = False
	for i, ln in enumerate(lines):
		if ln.startswith("charts:"):
			in_charts = True
			continue
		if in_charts and re.match(r"^\w", ln):
			in_charts = False
		if not in_charts:
			continue
		m = CHART_RE.match(ln)
		if m:
			charts.append({"id": m.group(1), "start": i})
	for k, c in enumerate(charts):
		end = charts[k + 1]["start"] if k + 1 < len(charts) else len(lines)
		for j in range(c["start"] + 1, end):
			if re.match(r"^\w", lines[j]):
				end = j
				break
		block = "\n".join(lines[c["start"]:end])
		# comment lines inside the block tail belong to the next chart: trim trailing comments
		blk_lines = lines[c["start"]:end]
		while blk_lines and blk_lines[-1].lstrip().startswith("#"):
			blk_lines.pop()
		block = "\n".join(blk_lines)
		c["text"] = block
		q = re.search(r"query: (\w+)", block)
		c["query"] = q.group(1) if q else ""
		t = re.search(r"type: (\w+)", block)
		c["type"] = t.group(1) if t else ""
		ti = re.search(r'title: "([^"]*)"', block)
		c["title"] = ti.group(1) if ti else c["id"]
		cols = set()
		for pat in (r"\bx: \{column: (\w+)", r"\bx: (\w+)", r"split_by: \{column: (\w+)"):
			cols.update(re.findall(pat, block))
		for pat in (r"\brows: \[([^\]]*)\]", r"\bcolumns: \[([^\]]*)\]"):
			for frag in re.findall(pat, block):
				cols.update(re.findall(r"\w+", frag))
		c["cols"] = cols
		lv = {COL_LEVEL[x] for x in cols if x in COL_LEVEL}
		for fid, qs in filters.items():
			if fid in FILTER_LEVEL and c["query"] in qs:
				lv.add(FILTER_LEVEL[fid])
		c["levels"] = lv
		# comment block directly above
		j = c["start"] - 1
		cm = []
		while j >= 0 and lines[j].lstrip().startswith("#"):
			cm.append(lines[j])
			j -= 1
		c["comment_ids"] = set()
		for cl in cm:
			if not IGNORE_COMMENT.search(cl):
				c["comment_ids"].update(ID_RE.findall(cl))
	return db, charts


def main():
	metrics = load_dictionary()
	chart_metrics, db_levels = parse_portfolio()
	dbs = {}
	for p in sorted((HERE / "dashboards").glob("DB*.yaml")):
		db, charts = parse_dashboard(p)
		dbs[db] = charts
	mids = {m["id"] for m in metrics}
	shown = {}  # metric -> list of (db, chart, levels)
	unmapped_charts = []
	missing_in_yaml = []
	yaml_chart_ids = set()
	for db, charts in dbs.items():
		for c in charts:
			yaml_chart_ids.add(c["id"])
			ids = (chart_metrics.get(c["id"], set()) | c["comment_ids"]) & mids
			lv = set(c["levels"])
			if "company" in db_levels.get(db, set()):
				lv.add("company")
			c["name_ids"] = set()
			if not ids:
				c["name_ids"] = {m["id"] for m in metrics if name_match(m, c)}
				ids = c["name_ids"]
			c["levels_final"] = lv
			c["metrics"] = ids
			if not ids:
				unmapped_charts.append((db, c))
			for mid in ids:
				shown.setdefault(mid, []).append((db, c["id"] + ("~" if mid in c["name_ids"] else ""), lv))
	for cid in sorted(chart_metrics):
		if cid not in yaml_chart_ids:
			missing_in_yaml.append(cid)

	def theme_of(mid):
		return PREFIX_THEME.get(mid.split("-")[0])

	out = []
	w = out.append
	total = len(metrics)
	n_shown = sum(1 for m in metrics if m["id"] in shown)
	not_shown = [m for m in metrics if m["id"] not in shown]
	fewer = []
	for m in metrics:
		if m["id"] in shown:
			got = set().union(*[x[2] for x in shown[m["id"]]])
			miss = [lv for lv in m["levels"] if lv not in got]
			if miss:
				fewer.append((m, got, miss))
	# matrix
	matrix = {(lv, th): set() for lv in LEVELS for th in THEMES}
	for m in metrics:
		th = theme_of(m["id"])
		if th is None or m["id"] not in shown:
			continue
		for db, cid, lv in shown[m["id"]]:
			for l in lv:
				if l in m["levels"]:
					matrix[(l, th)].add(db)
	empty_cells = [k for k, v in matrix.items() if not v]

	w("# URY restaurant analytics: coverage catalogue")
	w("")
	w("Generated by `build_coverage.py` (do not edit by hand; rerun the script). Inputs: `metric_dictionary.json`, `dashboard_portfolio.md`, `dashboards/DB*.yaml`.")
	w("")
	w("## Method (what counts as shown)")
	w("")
	w("- A metric is SHOWN only if a chart that currently exists in a `dashboards/DB*.yaml` file is tied to it, either by that chart's row in `dashboard_portfolio.md` or by a `#` comment block directly above the chart in the YAML naming the metric id. Comments flagged T4 / not recorded / dropped are ignored. Charts listed in the portfolio but absent from the YAML do not count.")
	w("- Fallback trace (marked `~` after the chart id): when a YAML chart has no id tie by (a) or (b), a metric is attached if the chart's title or a y label equals/contains the metric name and the chart's query is one of the metric's source facts. Weaker evidence than an id tie.")
	w("- Level shown is inferred per chart from its grouping columns (x, rows, columns, split_by) and from dashboard filters whose `applies_to` names the chart's query (branch, waiter = employee, department, category, item). Company comes from the DB's `Levels:` line in the portfolio. This is a chart-level inference, not a per-metric guarantee.")
	w("- Theme matrix: metric prefix -> theme (MAR margin; PRD, PLN production; WST, STK wastage; YLD yield; KIT, TBL timing; SAL, MNU, PAY sales; EMP people). LKG (leakage) and DQ (data quality) metrics belong to no requested theme and are excluded from the matrix. A cell counts a DB only if one of its charts shows a metric of that theme at that level and the dictionary lists that level for the metric.")
	w("")
	w("## Summary counts")
	w("")
	w(f"- Metrics total: {total}")
	w(f"- Shown (traced to a chart): {n_shown} (of which only by `~` name match: {sum(1 for m in metrics if m['id'] in shown and all(x[1].endswith('~') for x in shown[m['id']]))})")
	w(f"- NOT SHOWN: {len(not_shown)}")
	w(f"- Shown at fewer levels than the dictionary says: {len(fewer)}")
	w(f"- Matrix cells EMPTY: {len(empty_cells)} of {len(LEVELS) * len(THEMES)}")
	w(f"- Charts in YAML: {len(yaml_chart_ids)}; with no metric id traced: {len(unmapped_charts)}; portfolio charts missing from YAML: {len(missing_in_yaml)}")
	w("")
	w("## 1. Metric coverage table")
	w("")
	w("| Metric | Name | Dictionary levels | Source | Tier | Shown by (DB: chart) | Levels shown | Status |")
	w("|---|---|---|---|---|---|---|---|")
	for m in metrics:
		mid = m["id"]
		src = ", ".join(m.get("source_queries") or []) or "none (not captured)"
		if mid in shown:
			byd = {}
			for db, cid, lv in shown[mid]:
				byd.setdefault(db, []).append(cid)
			sh = "; ".join(f"{db}: {', '.join(sorted(set(cs)))}" for db, cs in sorted(byd.items()))
			got = set().union(*[x[2] for x in shown[mid]])
			ls = ", ".join(lv for lv in LEVELS if lv in got) or "none inferred"
			miss = [lv for lv in m["levels"] if lv not in got]
			st = "shown" if not miss else "partial levels"
		else:
			sh, ls, st = "NOT SHOWN", "-", "NOT SHOWN"
		w(f"| {mid} | {m['name']} | {', '.join(m['levels'])} | {src} | {m['tier']} | {sh} | {ls} | {st} |")
	w("")
	w("## 2. Gap list")
	w("")
	w(f"### 2a. Metrics shown nowhere ({len(not_shown)})")
	w("")
	w("| Metric | Name | Tier | Source | Dictionary says dashboards |")
	w("|---|---|---|---|---|")
	for m in not_shown:
		src = ", ".join(m.get("source_queries") or []) or "none (not captured)"
		w(f"| {m['id']} | {m['name']} | {m['tier']} | {src} | {', '.join(m.get('dashboards') or []) or '-'} |")
	w("")
	w(f"### 2b. Metrics shown at fewer levels than the dictionary ({len(fewer)})")
	w("")
	w("| Metric | Name | Dictionary levels | Levels shown | Missing levels |")
	w("|---|---|---|---|---|")
	for m, got, miss in fewer:
		w(f"| {m['id']} | {m['name']} | {', '.join(m['levels'])} | {', '.join(lv for lv in LEVELS if lv in got) or '-'} | {', '.join(miss)} |")
	w("")
	w("### 2c. Level x theme matrix")
	w("")
	w("Cell = DBs with a traced chart for that theme at that level; EMPTY = none.")
	w("")
	w("| Level | " + " | ".join(THEMES) + " |")
	w("|---|" + "---|" * len(THEMES))
	for lv in LEVELS:
		cells = [", ".join(sorted(matrix[(lv, th)])) or "EMPTY" for th in THEMES]
		w(f"| {lv} | " + " | ".join(cells) + " |")
	w("")
	w(f"EMPTY cells ({len(empty_cells)}): " + ", ".join(f"{lv} x {th}" for lv, th in empty_cells))
	w("")
	w("### 2d. Traceability notes")
	w("")
	w(f"Portfolio charts missing from the YAML ({len(missing_in_yaml)}): " + (", ".join(missing_in_yaml) or "none"))
	w("")
	w(f"YAML charts with no metric id traced ({len(unmapped_charts)}): " + (", ".join(f"{db}:{c['id']}" for db, c in unmapped_charts) or "none"))
	w("")
	w("## 3. Closing the gaps")
	w("")
	w("Proposals are suggestions only; none is counted as coverage above.")
	w("")
	w("| Gap | Proposed carrier | Needs data capture? |")
	w("|---|---|---|")
	for m in not_shown:
		car, cap = propose(m)
		w(f"| {m['id']} {m['name']} (NOT SHOWN) | {car} | {cap} |")
	for m, got, miss in fewer:
		car, cap = propose_levels(m, miss)
		w(f"| {m['id']} {m['name']} (missing {', '.join(miss)}) | {car} | {cap} |")
	for lv, th in empty_cells:
		car, cap = propose_cell(lv, th)
		w(f"| EMPTY {lv} x {th} | {car} | {cap} |")
	w("")
	(HERE / "COVERAGE.md").write_text("\n".join(out) + "\n")
	print(f"metrics_total={total}")
	print(f"shown={n_shown}")
	print(f"not_shown={len(not_shown)}")
	print(f"fewer_levels={len(fewer)}")
	print(f"empty_matrix_cells={len(empty_cells)}")
	print(f"yaml_charts={len(yaml_chart_ids)} unmapped_charts={len(unmapped_charts)} portfolio_missing_in_yaml={len(missing_in_yaml)}")


# --- proposal rules (judgement encoded as data; edit here) ---
HOME = {
	"SAL": "DB03 Sales deep-dive", "MNU": "DB04 Menu & category", "PRD": "DB05 Department production",
	"PLN": "DB13 Production planning", "KIT": "DB06 Kitchen timing", "TBL": "DB07 Table & floor",
	"EMP": "DB08 Employee performance", "PAY": "DB09 Payments & cash-up", "MAR": "DB10 Margin & cost",
	"WST": "DB11 Wastage & shrinkage", "STK": "DB11 Wastage & shrinkage", "YLD": "DB12 Yield & recipe",
	"LKG": "DB15 Leakage", "DQ": "DB14 Data quality",
}


def _capture(m):
	if not m.get("source_queries"):
		return "Yes: no source fact/field recorded (tier %s); needs new capture or a new fact before charting" % m["tier"]
	if m["tier"] == "T4":
		return "Yes: tier T4, source rows not populated on this site; capture must start first"
	if m["tier"] == "T3":
		return "Partly: tier T3, data exists but is seeded or low quality; verify before charting"
	return "No: source fact exists (%s); chart only" % ", ".join(m["source_queries"])


def propose(m):
	home = HOME.get(m["id"].split("-")[0], "closest DB by prefix")
	return f"{home}: add a chart/KPI tile for {m['name']}", _capture(m)


def propose_levels(m, miss):
	home = HOME.get(m["id"].split("-")[0], "closest DB by prefix")
	return f"{home}: add a {'/'.join(miss)} split or filter to the chart(s) showing {m['name']}", _capture(m)


def propose_cell(lv, th):
	home = {
		"margin": "DB10", "production": "DB05/DB13", "wastage": "DB11", "yield": "DB12",
		"timing": "DB06/DB07", "sales": "DB03/DB04", "people": "DB08",
	}[th]
	return f"{home}: add a {th} chart grouped by {lv} (or a {lv} filter)", "Depends on the metrics for that cell; see tiers in section 1"


if __name__ == "__main__":
	sys.exit(main())
