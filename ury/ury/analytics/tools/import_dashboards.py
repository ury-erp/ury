import os
import re
import glob
import json
import yaml
import frappe

LATEST_DAY = "__LATEST_DAY__"


def latest_sales_day():
    """The last day with a submitted, non-return POS Invoice (the day the dashboards open on), as YYYY-MM-DD."""
    d = frappe.db.sql("select max(posting_date) from `tabPOS Invoice` where docstatus = 1 and is_return = 0")[0][0]
    return str(d) if d else None


def resolve_latest_day(value):
    """Replace the __LATEST_DAY__ placeholder in a YAML filter default with the last day with sales.
    With no sales at all the default is dropped (None), so the dashboard opens on every date."""
    if isinstance(value, list) and LATEST_DAY in value:
        day = latest_sales_day()
        return [day if v == LATEST_DAY else v for v in value] if day else None
    if isinstance(value, dict) and value.get("anchor") == LATEST_DAY:
        day = latest_sales_day()
        return {**value, "anchor": day} if day else None
    return value


def refresh_latest_day_defaults():
    """Point every dashboard Date filter that defaults to the latest day (YAML default value [__LATEST_DAY__, __LATEST_DAY__])
    at the current last day with sales. Scheduled daily (hooks) so the dashboards keep opening on the latest day.
    bench --site <site> execute ury.ury.analytics.tools.import_dashboards.refresh_latest_day_defaults"""
    day = latest_sales_day()
    if not day:
        return {}
    done = {}
    for fpath in sorted(glob.glob(os.path.join(_get_app_path(), "dashboards", "DB*.yaml"))):
        with open(fpath) as fp:
            spec = yaml.safe_load(fp)
        dsh = (spec.get("dashboards") or [{}])[0]
        title = dsh.get("title")
        def _latest(v):
            return (isinstance(v, list) and LATEST_DAY in v) or (isinstance(v, dict) and v.get("anchor") == LATEST_DAY)
        labels = {f.get("label"): f["default"] for f in dsh.get("filters", []) if _latest((f.get("default") or {}).get("value"))}
        if not labels:
            continue
        for name in frappe.get_all("Insights Dashboard v3", filters={"title": title}, pluck="name"):
            items = json.loads(frappe.db.get_value("Insights Dashboard v3", name, "items") or "[]")
            changed = False
            for it in items:
                if it.get("type") == "filter" and it.get("filter_name") in labels:
                    default = labels[it["filter_name"]]
                    value = resolve_latest_day(default["value"])
                    if it.get("default_value") != value or it.get("default_operator") != default.get("op"):
                        it["default_operator"], it["default_value"] = default.get("op"), value
                        changed = True
            if changed:
                frappe.db.set_value("Insights Dashboard v3", name, "items", json.dumps(items), update_modified=False)
                done[name] = day
    frappe.db.commit()
    return done


def _get_app_path():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def extract_col_and_agg(y_meas):
    meas_name = y_meas.get('as')
    col_name = y_meas.get('column')
    agg = y_meas.get('agg')
    expr = y_meas.get('expr')
    
    if expr and (not col_name or not agg):
        m = re.search(r'\b(sum|avg|count_distinct|count|min|max)\(([\w\.\`]+)\)', expr, re.IGNORECASE)
        if m:
            if not agg:
                agg = m.group(1).lower()
            if not col_name:
                col_name = m.group(2).replace('`', '').split('.')[-1]
                
    if not col_name:
        col_name = 'net_total'
    if not agg:
        agg = 'sum'
    if not meas_name:
        meas_name = y_meas.get('as', col_name)
        
    return col_name, agg, meas_name

def build_measure(y_meas):
    """Insights v3 measure for a YAML `y` entry.

    `expr` -> expression measure, evaluated by Insights as an ibis expression over the source query
    (e.g. "sum(sla_breach) / sum(is_served)"), so ratios and differences keep their full formula.
    `column` + `agg` -> plain column measure.
    """
    col_name, agg, meas_name = extract_col_and_agg(y_meas)
    if y_meas.get('expr'):
        return {
            "measure_name": meas_name,
            "expression": {"type": "expression", "expression": y_meas['expr']},
            "data_type": "Decimal",
        }
    return {
        "measure_name": meas_name,
        "column_name": col_name,
        "data_type": "Decimal",
        "aggregation": agg,
    }

def translate_mutate_expr(expr, joined_cols):
    """Translate a YAML `mutate` expression (Insights/ibis function names) into SQL.

    The generated SQL runs on MariaDB and, for data-store queries, on DuckDB (Insights transpiles it),
    so only functions both understand are emitted (IF, COALESCE, CAST, HOUR, DAYNAME, LPAD, LIKE).
    Any function not handled here would be passed through verbatim and fail at query time.
    """
    expr = expr.replace('if_else', 'IF').replace('coalesce', 'COALESCE')
    expr = expr.replace('==', '=')
    # x.cast(...) on a text column that may hold '' (blank -> 0). The value is turned into text first so the
    # same SQL also works when the column is numeric (DuckDB rejects comparing a DECIMAL with '').
    expr = re.sub(r'(\w+)\.cast\("int64"\)', r"CAST(COALESCE(NULLIF(CAST(\1 AS CHAR), ''), '0') AS SIGNED)", expr)
    expr = re.sub(r'(\w+)\.cast\("float64"\)', r"CAST(COALESCE(NULLIF(CAST(\1 AS CHAR), ''), '0') AS DECIMAL(10,2))", expr)
    expr = re.sub(r'hour\((\w+)\)', r'HOUR(\1)', expr)
    expr = re.sub(r'day_name\((\w+)\)', r'DAYNAME(\1)', expr)
    # pad_number(x, n) -> zero-padded string, e.g. 7 -> '07'
    expr = re.sub(r'pad_number\((.+?),\s*(\d+)\)', r"LPAD(CAST(\1 AS CHAR), \2, '0')", expr)
    # starts_with(col, 'text') -> col LIKE 'text%'
    expr = re.sub(r"starts_with\((\w+),\s*'([^']*)'\)", r"(\1 LIKE '\2%')", expr)
    for jc, j_tbl in joined_cols.items():
        expr = re.sub(rf'\b{jc}\b', f"`tab{j_tbl}`.`{jc}`", expr)
    return expr

def build_dimension(spec):
    """Insights v3 dimension from a YAML row/column: "col" or {column: col, as: Label[, type: Date]}."""
    if isinstance(spec, dict):
        col = spec['column']
        return {"column_name": col, "dimension_name": spec.get('as', col), "data_type": spec.get('type', 'String')}
    return {"column_name": spec, "dimension_name": spec, "data_type": "String"}

def build_where(filters, col_prefix, joined_cols=None):
    """SQL WHERE clause for YAML query filters.

    col_prefix is the table/CTE the columns belong to. A filter on a column that comes from a joined table
    (listed in that join's `columns`, e.g. is_return from POS Invoice) is pointed at that table instead.
    """
    joined_cols = joined_cols or {}
    where = []
    for flt in filters or []:
        col = flt['column']
        op = flt['op']
        val = flt['value']
        col_ref = f"`tab{joined_cols[col]}`.`{col}`" if col in joined_cols else f"{col_prefix}.`{col}`"
        op_lower = op.lower() if isinstance(op, str) else ''
        if op_lower == 'in':
            vals_str = ", ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in val)
            where.append(f"{col_ref} IN ({vals_str})")
        elif op_lower == 'not in':
            vals_str = ", ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in val)
            where.append(f"{col_ref} NOT IN ({vals_str})")
        elif op_lower == 'contains':
            where.append(f"{col_ref} LIKE '%{val}%'")
        elif op_lower == 'not_contains':
            where.append(f"{col_ref} NOT LIKE '%{val}%'")
        elif op_lower == 'starts_with':
            where.append(f"{col_ref} LIKE '{val}%'")
        elif op_lower == 'ends_with':
            where.append(f"{col_ref} LIKE '%{val}'")
        elif val is None:
            where.append(f"{col_ref} IS NULL" if op == '=' else f"{col_ref} IS NOT NULL")
        elif isinstance(val, str):
            where.append(f"{col_ref} {op} '{val}'")
        else:
            where.append(f"{col_ref} {op} {val}")
    return f"WHERE {' AND '.join(where)}" if where else ""

def build_query_sql(q, query_dict, sem_queries):
    """Convert YAML query spec to MariaDB SQL"""
    if 'sql' in q and q['sql']:
        raw = q['sql']
        raw = re.sub(r'TIME_TO_SEC\(([^)]+)\)', r'epoch(TRY_CAST(\1 AS TIME))', raw)
        # MySQL TIMESTAMP(date, time) has no DuckDB equivalent (data-store queries run on DuckDB); build it portably.
        raw = re.sub(r'\bTIMESTAMP\(\s*([\w.`]+)\s*,\s*([\w.`]+)\s*\)', r"CAST(CONCAT(\1, ' ', \2) AS DATETIME)", raw)
        return raw
    
    if 'source_query' in q:
        src_id = q['source_query']
        src_q = query_dict.get(src_id) or sem_queries.get(src_id)
        if not src_q:
            src_sql = "SELECT * FROM `tabPOS Invoice` WHERE docstatus=1"
        else:
            src_sql = build_query_sql(src_q, query_dict, sem_queries)
            
        cte = f"WITH {src_id} AS ({src_sql})"

        joined_cols = {}
        for j in q.get('joins', []):
            j_table = j['table']
            for jc in j.get('columns', []):
                joined_cols[jc] = j_table

        joins_sql = []
        for j in q.get('joins', []):
            j_table = j['table']
            j_type = j.get('type', 'left').upper()
            on_cond = j.get('on') or j.get(True)
            if on_cond:
                left_col = on_cond[0]
                right_col = on_cond[1]
                if left_col in joined_cols:
                    left_ref = f"`tab{joined_cols[left_col]}`.`{left_col}`"
                else:
                    left_ref = f"{src_id}.`{left_col}`"
                joins_sql.append(f"{j_type} JOIN `tab{j_table}` ON `tab{j_table}`.`{right_col}` = {left_ref}")
        
        mutate_map = {}
        for m in q.get('mutate', []):
            as_col = m['as']
            mutate_map[as_col] = translate_mutate_expr(m['expr'], joined_cols)
            
        select_cols = []
        for s in q.get('select', []):
            if s in mutate_map:
                select_cols.append(f"{mutate_map[s]} AS `{s}`")
            elif s in joined_cols:
                j_table = joined_cols[s]
                select_cols.append(f"`tab{j_table}`.`{s}` AS `{s}`")
            else:
                select_cols.append(f"{src_id}.`{s}` AS `{s}`")
                
        if not q.get('select'):
            # no explicit select: every source column plus every mutate column
            select_cols = [f"{src_id}.*"] + [f"{expr} AS `{as_col}`" for as_col, expr in mutate_map.items()]
        sel_str = ", ".join(select_cols)
        join_str = " ".join(joins_sql)
        where_str = build_where(q.get('filters', []), src_id, joined_cols)
        return f"{cte} SELECT {sel_str} FROM {src_id} {join_str} {where_str}"

    if 'table' in q and q['table']:
        table = q['table']
        table_name = f"`tab{table}`"

        # Pre-collect joined columns map: col_name -> j_table
        joined_cols = {}
        for j in q.get('joins', []):
            j_table = j['table']
            for jc in j.get('columns', []):
                joined_cols[jc] = j_table

        joins_sql = []
        for j in q.get('joins', []):
            j_table = j['table']
            j_type = j.get('type', 'left').upper()
            on_cond = j.get('on') or j.get(True)
            if on_cond:
                left_col = on_cond[0]
                right_col = on_cond[1]
                if left_col in joined_cols:
                    left_ref = f"`tab{joined_cols[left_col]}`.`{left_col}`"
                else:
                    left_ref = f"{table_name}.`{left_col}`"
                joins_sql.append(f"{j_type} JOIN `tab{j_table}` ON `tab{j_table}`.`{right_col}` = {left_ref}")

        where_str = build_where(q.get('filters', []), table_name, joined_cols)

        mutate_map = {}
        for m in q.get('mutate', []):
            as_col = m['as']
            mutate_map[as_col] = translate_mutate_expr(m['expr'], joined_cols)

        select_cols = []
        for s in q.get('select', []):
            if s in mutate_map:
                select_cols.append(f"{mutate_map[s]} AS `{s}`")
            elif s in joined_cols:
                j_table = joined_cols[s]
                select_cols.append(f"`tab{j_table}`.`{s}` AS `{s}`")
            else:
                select_cols.append(f"{table_name}.`{s}` AS `{s}`")

        sel_str = ", ".join(select_cols) if select_cols else "*"
        join_str = " ".join(joins_sql)
        return f"SELECT {sel_str} FROM {table_name} {join_str} {where_str}"

    return "SELECT 1"

def convert_chart_filters(flt_list):
    """Convert YAML chart filters to Frappe Insights filter_group structure"""
    if not flt_list:
        return {"logical_operator": "And", "filters": []}
    
    rules = []
    for f in flt_list:
        col = f.get('column')
        op = f.get('op', '=')
        val = f.get('value')
        rules.append({
            "column": {"type": "column", "column_name": col},
            "operator": op,
            "value": val
        })
    return {"logical_operator": "And", "filters": rules}

def build_chart_operations(q_docname, ctype, config):
    """Build Frappe Insights Query operations for a chart data_query"""
    ops = [
        {
            "type": "source",
            "table": {
                "type": "query",
                "query_name": q_docname,
                "workbook": ""
            }
        }
    ]

    flt_group = config.get("filters", {})
    if flt_group.get("filters"):
        ops.append({
            "type": "filter_group",
            "logical_operator": flt_group.get("logical_operator", "And"),
            "filters": flt_group.get("filters", [])
        })

    if ctype == 'Number':
        dims = []
        if config.get("date_column", {}).get("column_name"):
            dims.append(config["date_column"])
        measures = [c for c in config.get("number_columns", []) if c.get("measure_name")]
        ops.append({
            "type": "summarize",
            "measures": measures,
            "dimensions": dims
        })
    elif ctype in ('Line', 'Row', 'Bar'):
        x_dim = config.get("x_axis", {}).get("dimension", {})
        series = config.get("y_axis", {}).get("series", [])
        measures = [s["measure"] for s in series if s.get("measure", {}).get("measure_name")]
        split = (config.get("split_by") or {}).get("dimension") or {}
        if split.get("column_name"):
            # same as the Insights frontend: split_by -> pivot
            ops.append({
                "type": "pivot_wider",
                "rows": [x_dim],
                "columns": [split],
                "values": measures,
                "max_column_values": config["split_by"].get("max_split_values") or 10
            })
        else:
            ops.append({
                "type": "summarize",
                "measures": measures,
                "dimensions": [x_dim] if x_dim.get("column_name") else []
            })
        for o in config.get("order_by", []):
            ops.append({"type": "order_by", "column": o["column"], "direction": o.get("direction", "desc")})
    elif ctype in ('Donut', 'Funnel'):
        lbl = config.get("label_column", {})
        val = config.get("value_column", {})
        ops.append({
            "type": "summarize",
            "measures": [val] if val.get("measure_name") else [],
            "dimensions": [lbl] if lbl.get("column_name") else []
        })
        if val.get("measure_name"):
            ops.append({
                "type": "order_by",
                "column": {"type": "column", "column_name": val["measure_name"]},
                "direction": "desc"
            })
    elif ctype == 'Table':
        rows = [r for r in config.get("rows", []) if r.get("column_name")]
        cols = [cl for cl in config.get("columns", []) if cl.get("column_name")]
        vals = [v for v in config.get("values", []) if v.get("measure_name")]
        if cols:
            # same as the Insights frontend: columns -> pivot
            ops.append({
                "type": "pivot_wider",
                "rows": rows,
                "columns": cols,
                "values": vals,
                "max_column_values": config.get("max_column_values", 10)
            })
        else:
            ops.append({
                "type": "summarize",
                "measures": vals,
                "dimensions": rows
            })
        for o in config.get("order_by", []):
            ops.append({"type": "order_by", "column": o["column"], "direction": o.get("direction", "desc")})
    return ops

def build_chart_config(c):
    """Insights v3 chart config for one YAML chart spec (shared by import_all and in-place repairs)."""
    ctype = c.get('type', 'Number')
    y_meas = c.get('y', [{}])[0]
    col_name, agg, meas_name = extract_col_and_agg(y_meas)
    base_measure = build_measure(y_meas)
    chart_filters = convert_chart_filters(c.get('filters', []))

    if ctype == 'Number':
        config = {
            "number_columns": [
                {
                    **base_measure,
                    "format": y_meas.get('format', 'number'),
                    "currency_column": "currency" if y_meas.get('format') == 'currency' else None,
                }
            ],
            "comparison": c.get('comparison', False),
            "sparkline": c.get('sparkline', True),
            "limit": 100,
            "filters": chart_filters
        }
        if 'date' in c:
            # Same shape the Insights UI saves (dimension_name/label/value are required for the
            # summarize dimension and the comparison/sparkline to resolve the date column).
            dcol = c["date"]["column"]
            config["date_column"] = {
                "column_name": dcol,
                "dimension_name": dcol,
                "label": dcol,
                "value": dcol,
                "data_type": c["date"].get("data_type", "Date"),
                "granularity": c["date"].get("granularity", "month")
            }
        config["order_by"] = []
        config["number_column_options"] = []
        if c.get('compare_previous'):
            # Insights develop period comparison: the card's Period is lent by a dashboard `within` filter on date.column
            # (e.g. {span: "current day", anchor: <latest day>}); the card reads that period and the one before it, with
            # the % change; the sparkline is cut one grain below the span (none for a single day). No legacy flag, no grain.
            dcol = c["date"]["column"]
            config.pop("comparison", None)
            config["date_column"] = {"column_name": dcol, "dimension_name": dcol, "label": dcol, "value": dcol,
                                     "data_type": c["date"].get("data_type", "Date")}
            config["sparkline"] = True
            config["number_column_options"] = [{"comparison": {"source": "previous"},
                                                **({"negative_is_better": True} if c.get('negative_is_better') else {})}]
        # Optional Number display options (same keys the Insights UI saves)
        for k in ('shorten_numbers', 'decimal', 'negative_is_better'):
            if k in c:
                config[k] = c[k]
    elif ctype in ('Line', 'Row', 'Bar'):
        x_raw = c.get('x', 'posting_date')
        x_col = x_raw['column'] if isinstance(x_raw, dict) else x_raw
        x_gran = x_raw.get('granularity') if isinstance(x_raw, dict) else None
        config = {
            "x_axis": {
                "dimension": {
                    "dimension_name": x_col,
                    "column_name": x_col,
                    "data_type": "Date" if x_gran else "String",
                    **({"granularity": x_gran} if x_gran else {})
                }
            },
            "y_axis": {
                # one series per `y` entry (e.g. Net sales and Target side by side)
                # a `color` on a y entry colours that series; show_area / smooth / show_data_points / align / series_type on a
                # y entry are per-series line options (same keys the Insights UI saves on the series)
                "series": [{"measure": build_measure(y),
                            **({"color": [y['color']]} if y.get('color') else {}),
                            **{k: y[k] for k in ('show_area', 'smooth', 'show_data_points', 'align') if k in y},
                            **({"type": y['series_type']} if y.get('series_type') else {})}
                           for y in (c.get('y') or [{}])]
            },
            "order_by": [
                {
                    "column": {"type": "column", "column_name": o.get('by', meas_name)},
                    "direction": o.get('dir', 'desc')
                }
                for o in c.get('order', [])
            ],
            "limit": c.get('limit', 100),
            "filters": chart_filters
        }
        # Optional styling (same keys the Insights UI saves)
        if 'label_rotation' in c:
            config["x_axis"]["label_rotation"] = c['label_rotation']
        for k in ('smooth', 'show_area', 'stack', 'normalize', 'overlap',
                  'show_data_labels', 'show_axis_label', 'show_scrollbar'):
            if k in c:
                config["y_axis"][k] = c[k]
        if c.get('color'):
            config["y_axis"]["series"][0]["color"] = [c['color']]
        # split_by: {column, max} -> one series per value of that column (e.g. per order type)
        if c.get('split_by'):
            sb = c['split_by']
            sb_col = sb['column'] if isinstance(sb, dict) else sb
            config["split_by"] = {
                "dimension": {"column_name": sb_col, "dimension_name": sb_col, "data_type": "String"},
                "max_split_values": (sb.get('max') if isinstance(sb, dict) else None) or 10,
            }
    elif ctype in ('Donut', 'Funnel'):
        x_col = c.get('x', 'order_type')
        config = {
            "label_column": {
                "dimension_name": x_col,
                "column_name": x_col,
                "data_type": "String"
            },
            "value_column": dict(base_measure),
            "legend_position": "bottom",
            "order_by": [],
            "limit": c.get('limit', 10),
            "filters": chart_filters
        }
    elif ctype == 'Table':
        # rows/columns: plain column names or {column, as[, type]}; values: every `y` (or `values`) entry.
        value_specs = c.get('y') or c.get('values') or [{}]
        values = []
        for v in value_specs:
            m = build_measure(v)
            if v.get('format'):
                m["format"] = v['format']
            values.append(m)
        config = {
            "rows": [build_dimension(r) for r in c.get('rows', [])],
            "columns": [build_dimension(cl) for cl in c.get('columns', [])],
            "values": values,
            "order_by": [
                {"column": {"type": "column", "column_name": o['by']}, "direction": o.get('dir', 'desc')}
                for o in c.get('order', [])
            ],
            "limit": c.get('limit', 50),
            "filters": chart_filters
        }
        # Optional table display options (same keys the Insights UI saves)
        for k in ('show_filter_row', 'compact_numbers', 'enable_color_scale',
                  'show_row_totals', 'show_column_totals', 'max_column_values'):
            if k in c:
                config[k] = c[k]
    else:
        config = {"limit": 100, "filters": chart_filters}
    return config

def import_all(only=None):
    """Import the URY YAML dashboards into Frappe Insights.

    only: optional filename prefix(es), e.g. "DB01" or "DB01,DB03", to import just those dashboards.
    bench --site <site> execute ury.ury.analytics.tools.import_dashboards.import_all --kwargs "{'only': 'DB01'}"
    """
    analytics_dir = _get_app_path()
    sem_path = os.path.join(analytics_dir, "semantic_layer.yaml")
    dashboards_glob = os.path.join(analytics_dir, "dashboards", "DB*.yaml")

    with open(sem_path) as f:
        sem_data = yaml.safe_load(f)
    sem_queries = {q['id']: q for q in sem_data.get('queries', [])}

    yaml_files = sorted(glob.glob(dashboards_glob))
    if only:
        prefixes = [p.strip() for p in (only.split(',') if isinstance(only, str) else only) if p.strip()]
        yaml_files = [f for f in yaml_files if any(os.path.basename(f).startswith(p) for p in prefixes)]
        if not yaml_files:
            frappe.throw(f"No dashboard YAML matches {only!r}")
    print(f"Starting import of {len(yaml_files)} URY Dashboards into Insights...")

    for fpath in yaml_files:
        fname = os.path.basename(fpath)
        with open(fpath) as fp:
            spec = yaml.safe_load(fp)

        wb_spec = spec.get('workbook', {})
        dsh_spec = spec.get('dashboards', [{}])[0]
        dash_title = dsh_spec.get('title', wb_spec.get('title', fname))
        wb_title = wb_spec.get('title', dash_title)

        # 1. Clean existing dashboard & charts with this title if present
        for old_d in frappe.get_all('Insights Dashboard v3', filters={'title': dash_title}, pluck='name'):
            frappe.delete_doc('Insights Dashboard v3', old_d, force=True, ignore_permissions=True)

        # 2. Workbook
        existing_wb = frappe.get_all('Insights Workbook', filters={'title': wb_title}, pluck='name')
        if existing_wb:
            wb_name = existing_wb[0]
        else:
            wb_doc = frappe.new_doc('Insights Workbook')
            wb_doc.title = wb_title
            wb_doc.insert()
            wb_name = wb_doc.name

        # 3. Queries
        dash_queries = {q['id']: q for q in spec.get('queries', [])}
        query_id_map = {}
        for qid, q in dash_queries.items():
            try:
                sql = build_query_sql(q, dash_queries, sem_queries)
            except Exception as e:
                print(f"  [WARN] Failed to build SQL for {qid}: {e}")
                sql = "SELECT 1"

            existing_q = frappe.get_all('Insights Query v3', filters={'workbook': wb_name, 'title': qid}, pluck='name')
            if existing_q:
                q_docname = existing_q[0]
                frappe.db.set_value('Insights Query v3', q_docname, {
                    'is_native_query': 1,
                    'operations': json.dumps([{'type': 'sql', 'raw_sql': sql, 'data_source': 'Site DB'}])
                })
            else:
                q_doc = frappe.new_doc('Insights Query v3')
                q_doc.title = qid
                q_doc.workbook = wb_name
                q_doc.is_native_query = 1
                q_doc.operations = json.dumps([{'type': 'sql', 'raw_sql': sql, 'data_source': 'Site DB'}])
                q_doc.insert()
                q_docname = q_doc.name
            query_id_map[qid] = q_docname

        # 4. Charts
        chart_id_map = {}
        for c in spec.get('charts', []):
            cid = c.get('id')
            ctitle = c.get('title', cid)
            ctype = c.get('type', 'Number')
            qid = c.get('query')
            q_docname = query_id_map.get(qid)
            if not q_docname:
                continue

            config = build_chart_config(c)
            if c.get('compare_previous'):
                # a card with a `window` ignores the Period a dashboard `within` filter lends it
                config.pop('window', None)

            chart_doc = frappe.new_doc('Insights Chart v3')
            chart_doc.title = ctitle
            chart_doc.workbook = wb_name
            chart_doc.query = q_docname
            chart_doc.chart_type = ctype
            chart_doc.config = json.dumps(config)
            chart_doc.insert()
            chart_id_map[cid] = chart_doc.name

            # Pre-populate data_query operations
            if chart_doc.data_query:
                dq_ops = build_chart_operations(q_docname, ctype, config)
                frappe.db.set_value('Insights Query v3', chart_doc.data_query, 'operations', json.dumps(dq_ops))

        # 5. Dashboard Items
        dashboard_items = []

        # Filters
        for f in dsh_spec.get('filters', []):
            fid = f.get('id')
            flabel = f.get('label', fid)
            ftype = f.get('type', 'string').title()
            ficon = f.get('icon', 'filter')
            layout = f.get('layout', {'x': 0, 'y': 0, 'w': 4, 'h': 1})
            default_val = f.get('default', {})
            if isinstance(default_val.get('value'), (list, dict)):
                default_val = {**default_val, 'value': resolve_latest_day(default_val['value'])}

            links = {}
            for qid, colname in f.get('applies_to', {}).items():
                q_docname = query_id_map.get(qid)
                if q_docname:
                    for c in spec.get('charts', []):
                        c_id = c.get('id')
                        if c.get('query') == qid and c_id in chart_id_map:
                            ch_docname = chart_id_map[c_id]
                            links[ch_docname] = f"`{q_docname}`.`{colname}`"

            dashboard_items.append({
                "type": "filter",
                "filter_name": flabel,
                "filter_type": ftype,
                "icon": ficon,
                "default_operator": default_val.get('op', 'within' if ftype == 'Date' else '='),
                "default_value": default_val.get('value', 'Last 30 days' if ftype == 'Date' else None),
                "layout": {
                    "i": f"filter-{fid}",
                    "x": layout.get('x', 0),
                    "y": layout.get('y', 0),
                    "w": layout.get('w', 4),
                    "h": layout.get('h', 1)
                },
                "links": links
            })

        # Items (charts & text)
        for idx, item in enumerate(dsh_spec.get('items', [])):
            if 'chart' in item:
                cid = item['chart']
                if cid in chart_id_map:
                    dashboard_items.append({
                        "type": "chart",
                        "chart": chart_id_map[cid],
                        "layout": {
                            "i": f"item-{cid}",
                            "x": item.get('x', 0),
                            "y": item.get('y', 0),
                            "w": item.get('w', 10),
                            "h": item.get('h', 6)
                        }
                    })
            elif 'text' in item:
                dashboard_items.append({
                    "type": "text",
                    "text": item['text'],
                    "layout": {
                        "i": f"text-{idx}",
                        "x": item.get('x', 0),
                        "y": item.get('y', 0),
                        "w": item.get('w', 20),
                        "h": item.get('h', 2)
                    }
                })

        dashboard_items = to_current_grid(dashboard_items, wb_name)

        dash_doc = frappe.new_doc('Insights Dashboard v3')
        dash_doc.title = dash_title
        dash_doc.workbook = wb_name
        dash_doc.items = json.dumps(dashboard_items)
        dash_doc.insert()
        print(f"  [OK] {fname:32s} -> Dashboard: '{dash_title}' ({dash_doc.name}) | Charts: {len(chart_id_map)}")

    frappe.db.commit()
    print("All 16 dashboards successfully imported and committed!")
    
    # Run analytics access grants
    from ury.ury.analytics_access import apply
    access_summary = apply()
    print(f"Access grants applied: {access_summary}")

    # Sync Workspace shortcuts in Desk
    sync_workspace_shortcuts()
    print("Workspace shortcuts synchronized with new dashboard IDs.")

def sync_workspace_shortcuts():
    """Sync Workspace Shortcut URLs with the freshly imported dashboard names"""
    shortcut_mapping = {
        'DB01': 'Owner overview',
        'DB02': 'Branch daily',
        'DB03': 'Sales deep-dive',
        'DB04': 'Menu and category',
        'DB05': 'Kitchen stations and production',
        'DB06': 'Kitchen timing',
        'DB07': 'Tables and floor',
        'DB08': 'Staff performance',
        'DB09': 'Payments and cash-up',
        'DB10': 'Margin and cost',
        'DB11': 'Stock count and wastage',
        'DB12': 'Yield and recipe',
        'DB13': 'Production planning',
        'DB14': 'Data readiness',
        'DB15': 'Leakage',
        'DB16': 'Owner brief check',
        'DB17': 'Customer analysis',
    }
    title_to_name = {
        d.title: d.name for d in frappe.get_all('Insights Dashboard v3', fields=['name', 'title'])
    }
    shortcuts = frappe.get_all('Workspace Shortcut', fields=['name', 'label', 'url'])
    for sc in shortcuts:
        for code, dash_title in shortcut_mapping.items():
            if code in sc.label:
                dash_name = title_to_name.get(dash_title)
                if dash_name:
                    new_url = f"/insights/dashboards/{dash_name}"
                    if sc.url != new_url:
                        frappe.db.set_value('Workspace Shortcut', sc.name, 'url', new_url)
                break
    frappe.db.commit()

