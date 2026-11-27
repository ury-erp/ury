# URY restaurant analytics: architecture

Owner ask: restaurant dashboards and insight broken down by department, item, category, employee, branch and company,
covering sales, margin, production, wastage, yield and timing (table, KOT). This document is the contract for the
builders who turn it into one finsights spec per dashboard. Companion files in this folder:
`metric_dictionary.json` (138 metrics, ids used everywhere), `semantic_layer.yaml` (the shared base queries, lint-clean),
`dashboard_portfolio.md` (DB01-DB16). Evidence: research RD1-RD7, U1, U2, P, PWA plan, proof/wave0_sql_gate.txt.
Target: Frappe 16.54 + Insights 3.15.1, demo site http://localhost:8002 (1 company "URY", 1 branch "URY Branch", INR).

## 1. Layers

| # | Layer | What lives there | Who owns it |
|---|---|---|---|
| L0 | Source facts | Frappe doctypes (POS Invoice, URY KOT, Yield Check, ...) | URY/ERPNext apps |
| L1 | Semantic base queries | 18 row-level queries in `semantic_layer.yaml` (`fact_*`, `dim_*`): fixed filters (docstatus, parenttype, is_return), pre-joined dimensions, common column names, computed flags | this architecture (copied verbatim by builders) |
| L2 | Metrics | `metric_dictionary.json`: definition, exact formula on L1 columns, grain, levels, tier, caveats | this architecture |
| L3 | Dashboards | DB01-DB16, one workbook each, charts aggregate L1 rows into L2 metrics | Sonnet builders |
| L4 | Audiences | owner, branch manager, kitchen/production head, floor/FOH manager, finance/controller, data owner | sharing via Team/DocShare (section 7) |

Rules that hold across layers:
1. Queries are row-level, charts aggregate (skill rule 7). A dashboard filter can only bind a column present in the query's final output, so every fact carries the level columns it supports.
2. One question, one fact. Never row-join two facts (sales x KOT, sales x plan, sales x wastage); show two charts under the same filters instead (double-count rules RD7 section 3).
3. Ratios are ratios of sums (`sum(a)/sum(b)`), never averages of ratios. Division by zero stays null.
4. A metric whose data is not there is still in the dictionary (tier T3/T4) and the dashboard shows an honest empty-state text block, never a fake or flat chart.
5. Builders do not invent new columns or joins. If a metric needs something not in L1, they stop and ask for an L1 change.

## 2. The six levels (definitions for THIS system)

| Level | Definition | Exact source | Decision where sources conflict |
|---|---|---|---|
| Company | Legal entity | `POS Invoice.company`, `URY KOT Execution.company`, Yield Check / Sales Plan / Wastage / Stock Correction `.company` | Carry from the fact. URY KOT and POS Closing Entry have no company: KOT via its Execution row, closing via `company` on POS Closing Entry header (present) |
| Branch | Outlet | `POS Invoice.branch` (100% set), `URY KOT.branch`, Execution/Yield/Plan/Wastage/Stock Correction `.branch`, `URY Table.branch` | POS Closing Entry.branch is NULL on 101/101: take `POS Opening Entry.branch` via `pos_opening_entry` (fact_closing_details). Stock Ledger/Warehouse have no branch: stock-ledger metrics are T4 until a warehouse->branch map exists |
| Department | Restaurant production department = **URY Production Department** (kitchen/bar section). NOT the HRMS Department (14 generic rows, used by 0 employees) | Sales view: `URY Item Production Configuration.department` per item + branch (configured). Kitchen view: `URY KOT.production` / `URY KOT Execution.production_unit` -> `URY Production Unit.department` (executed). Plan: `URY Sales Plan Item.department`. Yield/Wastage: own `department` field | **Two named variants, never mixed in one chart**: "configured department" for money (revenue, margin, plan) and "executed unit" for kitchen work (KOTs, timing, load). They disagree on 74/203 KOT lines (e.g. Tandoori Chicken configured Indian Kitchen, cooked in Tandoor). Unit -> department is 1:1 today (Unit.department == own name), so executed unit doubles as department; the model keeps the join so grouping units under one department later just works. Items with no config department show as `Unmapped` (17.4% of revenue) |
| Item | Sellable item | `POS Invoice Item.item_code` / `URY KOT Items.item` / Yield Check `.item` / Plan Item `.item_code` | `item_code` is the key everywhere; `item_name` for display |
| Category | Cleaned **menu category** (CATEGORY_MAP v1, section 3) with a **category family** above it (Food / Beverage / Non-menu / Unassigned) | `POS Invoice Item.item_group` (line snapshot, identical to Item master today) mapped through CATEGORY_MAP v1 | The Item Group tree is flat (82 children of the root, depth 1) and polluted ('All Item Groups' used as a category = 11.4% of revenue; Dessert/Desserts, Soups/Soups&Salads/SALADS, RICE/Biryani & Rice/Special Rice duplicates). Raw `item_group` is kept for drill-down only; every category chart uses `menu_category` |
| Employee | **Frappe User** (login id) acting in the role named by the field: waiter (`POS Invoice.waiter`), cashier (`.cashier`), closing user (`POS Closing Entry.user`), kitchen actor (`Execution.started_by/ready_by/served_by`, text user id), yield checker (`checked_by`) | as listed | NOT HR Employee: `Employee.user_id` is set on 2 of 8 employees and `custom_waiter_employee` on 2 people only, contradicting `waiter`. HR Employee becomes usable only after roadmap item R3. `URY KOT.user` holds display names and is not used as an employee key |

Level availability per fact (the dashboard filter matrix builders must respect):

| Fact | company | branch | department | item | category | employee |
|---|---|---|---|---|---|---|
| fact_sales_lines | company | branch | department (configured, item-only join) | item_code | item_group (raw) | waiter, cashier |
| fact_sales_lines_enriched | company | branch | department (configured, item+branch) | item_code | menu_category, category_family | waiter, cashier |
| fact_invoices / fact_cancellations | company | branch | - (bill spans departments) | - | - | waiter, cashier |
| fact_payments / fact_closing_details | company | branch | - | - | - | cashier / user |
| fact_kot_headers / fact_kot_lines | - (via exec) | branch | production (executed unit) | - / item | - / item_group (raw) | - |
| fact_kot_exec | company | branch | department (executed) | - | - | started_by/ready_by/served_by |
| fact_table_sessions | company | branch | - | - | - | waiter |
| fact_stock_correction | company | branch | - | item_code | item_group (raw) | - |
| fact_yield_checks | company | branch | department (EMPTY) | item | item_group (raw) | checked_by |
| fact_sales_plan_items | company | branch | department | item_code | - | - |
| fact_wastage_lines | company | branch | department | item_code | - | captured_by/approved_by |
| fact_daily_pnl | - | branch | - | - | - | - |

A level that a fact cannot carry is not faked: e.g. covers and bill counts cannot be split by department (one bill
spans several kitchens); only line-level `net_amount` can.

Multi-branch readiness: every fact carries `branch` and (where it exists) `company`; dashboards always include a Branch
filter and a "by branch" view even though the demo renders one bar. Two traps to fix before a second branch goes live:
`fact_sales_lines` joins config on item only (use `fact_sales_lines_enriched`, which joins item AND branch), and URY
Table names are not branch-qualified (always filter branch from the invoice).

## 3. CATEGORY_MAP v1 (recommended mapping table)

Implemented as one SQL `CASE` in `fact_sales_lines_enriched` and `dim_item` (byte-identical copies). Long-term fix
(roadmap R6): make it real data, i.e. create these categories as Item Group parents so `parent_item_group` is the
category and the mapping becomes a plain equality join.

| menu_category | item_group values | family |
|---|---|---|
| Desserts | Dessert, Desserts, Pastry, Ice cream | Food |
| Soups & Salads | Soups, Soups&Salads, SALADS, Salad Chicken | Food |
| Grills & Kebabs | Grills & BBQ, CHARCOL GRILLED, Grilled Specials, Chicken Al Fahams, KEBAB, Chicken Kebabs | Food |
| Rice & Biryani | RICE, Biryani & Rice, Special Rice | Food |
| Mains & Curries | Curries, GRAVY, GARAVIES, Main Course | Food |
| Burgers & Wraps | BURGER & WRAPS, Burgers & Sandwiches | Food |
| Combos & Platters | COMBOS, COMBO-LULU, PLATTER | Food |
| Soft Drinks | Soft Drinks, Cool Drinks, Soft Drink Spl, Soft Drink Can | Beverage |
| Juices & Beverages | Juices&Mocktails, Smoothies, Beverages | Beverage |
| Unassigned | All Item Groups (root misused), NULL | Unassigned |
| Non-menu | Raw Material, Services, Sub Assemblies, Consumable, Central Store, Burning(+ Materials), Cleaning(+ Material), Disposable(s), Chicken, Frozen Goods, Groceries, GROCERY, Milk & Curd, FISH, Provision, Sauces, Powder, Oil, Fruits, Kitchen Materials, Vegetable, VEGETABLES, Ejt Masalas, PROCESSED, MASALA PROCESSED, Rice Raw, Grilled Specials Raw, Chicken Kebabs Raw, Raw Meat, MEAT, Charges, General, Staff Food | Non-menu |
| (pass-through) | Starters, Chinese, South Indian, Pizza, Pasta, FRIES, BREADS, HUMMUS SPECIAL, SOUL MEAL BOWL, Chicken Specials, Accompaniments, AGGREGATOR PRODUCTS, Products, any new group | Food |

Governance: a new Item Group lands as pass-through (visible, never lost). DQ-003 tracks the Unassigned share.

## 4. Two invoice populations and how metrics treat them

The demo holds two disjoint POS Invoice populations (RD1, gate proof):
- **Consolidated** (2102 bills, 2025-08-06..2026-08-17, net 2,256,026): merged into Sales Invoices by POS closing; waiter = `urycashier` on all, pax > 0 on 11, dwell 30-minute seeds.
- **Paid** (1075 bills, 2026-06-24..2026-10-21, net 1,498,040): not yet closed; 6 real waiters, pax on all, dwell 00:00:00 on dine-in.

Every fact derives `population = if_else(status == 'Consolidated', 'Consolidated', 'Paid')` (all non-consolidated
submitted bills are 'Paid' in this model). Treatment:

| Metric family | Population rule |
|---|---|
| Revenue, bills, ATV, items, categories, departments, channel, payments, cancellations | BOTH (population is a filter/split, default all) |
| Waiter/captain performance (EMP-001..008), covers (SAL-015/016), spend per cover | **Paid only** (chart filter `population = Paid`); Consolidated attribution is synthetic |
| Table dwell (TBL-004) | `dwell_valid = 1` only (excludes the 00:00:00 Paid rows); label as seeded |
| Cash-up (PAY-006/007) | Closings exist only for Consolidated; PAY-008 shows Paid = "unclosed sales" |

**Consolidated Sales Invoice copies are never used** for sales metrics (they duplicate POS Invoice revenue and carry
waiter = cashier, pax = 1). Sales Invoice Payment always filtered `parenttype = 'POS Invoice'`.

## 5. Revenue, cost and margin definitions with readiness tiers

Tiers (used on every metric and every dashboard section):
- **T1** ready on demo data and meaningful.
- **T2** computable, needs a visible caveat (partial coverage, seeded shape, proxy definition).
- **T3** structurally possible (fields/joins exist, query written) but demo data empty, uniform or too small to read.
- **T4** needs new data capture (field, doctype, or a process that is not running).

Revenue: **net sales = SUM(POS Invoice Item.net_amount) = SUM(POS Invoice.net_total)**, docstatus = 1, is_return = 0
(3,754,065.59 on demo). Item/category/department roll-ups use line `net_amount`; waiter/branch/company/channel use header
`net_total`; never sum a header after joining lines. Gross sales = `total` (before bill discount). Tax is 0 today; if a
site adds tax or a service charge, net sales stays excl. tax. Returns are excluded from facts by design (0 exist);
when they appear, add SAL-018 as a separate negative series rather than netting silently.

Cost and margin ladder (pick the highest tier available, always show its coverage):

| Tier | Margin source | Metrics | Status on demo |
|---|---|---|---|
| T2 | URY Daily P and L (submitted, branch x day): gross_profit, cogs, net_profit | MAR-001..004 | 116 submitted docs, seeded; COGS uses BOM x buying price list covering few items, so optimistic |
| T2 | BOM recipe estimate: `qty x (BOM.raw_material_cost / BOM.quantity)` of the default active BOM, costed lines only | MAR-006..008, MNU-012 | costs ~6-8% of revenue; always paired with MAR-005 coverage % (T1) |
| T3 | URY Cost Variance Snapshot (theoretical vs counted) | MAR-012 | 8 seeded rows, company only |
| T4 | GL food cost, stock-ledger consumption, POS line `incoming_rate` | MAR-010, MAR-011 | incoming_rate 0 on all lines; 91% of sales SLE at zero rate; one cost center, warehouses without branch |

Margin is an item/category/department/branch property. There is no employee margin (RD3 M12): employee dashboards show
revenue contribution only.

## 6. Timing model: what each timestamp really means

| Timestamp | Real meaning | Trust |
|---|---|---|
| `POS Invoice.posting_date/posting_time` | Draft creation of the bill = order start for dine-in (not bill print). Stored unpadded; `hour(posting_time)` verified | Trust for hour/weekday demand only |
| `POS Invoice.arrived_time` (Data) | = invoice `creation`, set by `calculate_and_set_times` on submit; NOT seating time | Do not present as arrival |
| `POS Invoice.total_spend_time` (Data HH:MM:SS) | now() at submit minus creation = order-open-to-pay, not seat-to-clear | T2: valid rows only (0 < x <= 8 h); demo values seeded (~30 min) or 00:00:00 |
| `URY KOT.date + time` | Ticket fired to kitchen; `hour(KOT.time)` verified | Trust for load by hour |
| `URY KOT.creation` | Equals date+time; back-dated in seeds | Never use as a wall-clock queue start |
| `URY KOT.start_time_prep` | Set at creation (= time, or +2 min): NOT a real prep start | Never use |
| `URY KOT.start_time_serv`, `production_time` | Serve moment and creation-to-serve MINUTES (text; shipped reports mislabel as seconds) | T2 legacy ticket time (45/132 rows; 40 seeded 12/20 min) |
| `URY KOT Execution.creation` | Row insert = queued proxy (no `queued_at` field) | T4 for queue wait |
| `Execution.started_at/ready_at/served_at/cancelled_at` | Final-state snapshots per state machine; `audit_log` NULL (no transition history) | Structure right; demo stamps milliseconds apart (T3) |
| `URY Service Request.requested_at/resolved_at` | Guest call and closure; no acknowledged_at | T3 (4 rows) |
| `URY Table.occupied/latest_invoice_time` | Live flag, time only, overwritten on seat/clear/transfer | Snapshot only, no history |

KOT target: **`POS Profile.custom_kot_warning_time`** (Int minutes): 15 for profile "URY", 10 for "URY Branch"; joined per
KOT via `KOT.pos_profile` (fact_kot_headers.custom_kot_warning_time, fact_kot_exec.target_minutes). Table attention
threshold: `POS Profile.table_attention_time` = 30 min. Hard-coded elsewhere: long-open ticket 30 min, max ticket 6 h.

Durations: computed only in native SQL with `TIMESTAMPDIFF(SECOND, start, end)` (= end - start in MariaDB) inside
`fact_kot_exec`. `time_diff` is never used (casts to TIME, drops dates and fractions; sign unverified). `date_diff` is
day-level only. Percentiles (P90) are not available in chart aggregations; only means and counts.

Trustworthy today: KOT counts, load by hour, throughput funnel counts, cancellation stages, SLA breach on the legacy
minutes (with seeded caveat). Not trustworthy on demo: every Execution duration, queue wait, order-to-serve, table dwell
as "time at table", RevPASH, utilisation.

## 7. Permissions and scoping

Insights 3.15.1 ignores Frappe User Permissions by default; a Date/Branch dashboard filter is a convenience, not a
security boundary.
1. **Never public** (`is_public` off on every dashboard/chart); access by Insights Team grant or DocShare (rule 12).
2. **Audience teams**: `URY Owners` (all dashboards), `URY Branch Managers` (DB02-DB09, DB11-DB15), `URY Kitchen`
   (DB05, DB06, DB11-DB13), `URY Finance` (DB09, DB10, DB11, DB15), `URY Data` (DB14). Workbooks are not team resources:
   share each workbook read-only via `update_share_permissions` to the members.
3. **Employee data** (DB08) restricted to Owners and Branch Managers; no pay/HR fields are exposed in any L1 query
   (Employee.payment_amount is deliberately absent). Waiter metrics are labelled "indicators, not verdicts".
4. **Branch scoping** when a second branch exists, in order of preference: (a) Insights Settings
   `apply_user_permissions = 1` with Branch User Permissions, proven first with a restricted non-admin user (unverified
   on Site DB and native `sql:` queries); (b) per-branch workbook copies whose base queries add `branch = '<X>'`
   (deterministic, a spec per branch, generated from one template); (c) never rely on the dashboard filter alone.
5. The owner PWA computes its own numbers in a whitelisted URY API with server-side scope; Insights is its drill-down.

## 8. Naming conventions

- Workbook id `ury_<domain>` (e.g. `ury_owner_overview`), title `URY <Dashboard title>`, module `URY`, `required_apps: [ury]`.
- One workbook = one dashboard = one spec file `design/specs/dbNN_<slug>.yaml` (builder deliverable).
- Query ids and titles: exactly the L1 names (`fact_sales_lines`, ...); title == id so every workbook reads the same.
  A dashboard-specific variant (rare, needs architect sign-off) is `<l1 id>__<suffix>`.
- Chart ids: `dbNN_<metric short>` (<= 40 chars, `^[a-z][a-z0-9_]{1,39}$`), e.g. `db01_net_sales_kpi`. Chart titles are
  human, unique per workbook, and end with the tier tag when not T1: `Spend per Cover (T2)`.
- Filter ids: `f_date`, `f_branch`, `f_company`, `f_department`, `f_category`, `f_item`, `f_waiter`, `f_order_type`,
  `f_population`, `f_unit`. Same id = same meaning on every dashboard.
- Measure aliases (`as`): Title Case business names from the dictionary (`Net Sales`, `Bills`, `Covers`).
- Text banners: start with `**T3**` / `**T4**` and the metric ids, then one sentence on what is missing and the roadmap id.

## 9. Ranked data-capture roadmap (what to record first)

Ranked by (metrics unlocked x decision value) / effort. "Unlocks" lists dictionary ids moving to T1/T2.

| Rank | Capture | Concretely | Unlocks |
|---|---|---|---|
| R1 | Wastage logging | Use URY Wastage + Wastage Item from the kitchen UI with reason_category and department mandatory; fix the code/schema drift (`date/time/stock` vs `posting_date/posting_time`); set KOT Items.disposition on voids | WST-001..005, KIT-016, DB11 core |
| R2 | Ingredient purchase rates and recipes | Purchase Receipts (or a buying Item Price list) for the ~66 BOM ingredients; default BOMs for top-selling dishes; BOM line yield | MAR-006..008 coverage from 6% toward 80%+, MNU-012, YLD-009, MAR-010/011 later |
| R3 | Employee.user_id for every POS/kitchen user (+ department, designation) | Enforce on user creation; backfill 6 of 8; drop or auto-fill custom_waiter_employee from waiter | EMP-013/014, HR-level employee roll-ups, commission |
| R4 | Real KOT actors and Execution stamps | Kitchen display writes the logged-in user (not Administrator) and real started/ready/served times; add `queued_at`; keep audit_log transitions; dedupe (unique kot + unit) | KIT-006..010, KIT-018, EMP-013, DQ-008 |
| R5 | Seat and clear timestamps | `seated_at`, `bill_requested_at`, `cleared_at` (POS Invoice or a URY Table Session doctype with table, party size, captain) plus an occupancy event log | TBL-009/010, real dwell, turnover by hour |
| R6 | Category tree | Create the CATEGORY_MAP v1 categories as Item Group parents, move the 9 root items, merge duplicates | MNU-005 without the CASE; DQ-003 to 0 |
| R7 | Covers as Int, dine-in only and required | `no_of_pax` Int on POS Invoice, required for Dine In, blank for others | SAL-015/016, EMP-004/005 to T1 |
| R8 | Yield Check department and checker | Default department/production_unit from Item Production Configuration; real checker user | YLD-008, EMP yield accountability, DQ-009 |
| R9 | Opening hours | URY Branch Operating Schedule + Exceptions per branch (0 rows today), timezone set | TBL-009 RevPASH, utilisation, per-open-hour KPIs |
| R10 | Item Production Configuration department for the 62 unmapped items | Fill department/unit; unique item_group-per-unit routing | DQ-002 to 0, PRD-001 to T1 |
| R11 | Branch on cash-up and stock | POS Closing Entry.branch; Warehouse -> branch map; cost center per branch | branch-level cash-up/stock/GL margin |
| R12 | Tips and service charge | A taxes row for service charge and a tip field per invoice | SAL-019, EMP-015 |
| R13 | Monthly targets | Small URY Brief Settings / target table per branch-month | SAL-021, owner brief slide 2 |
| R14 | Controlled cancel/discount reasons + canceller | Select list instead of free text; store cancelled_by and discount approver | LKG-004 quality, EMP-008 true attribution |
| R15 | Sales Plan committed_qty and fulfilment history; returns/credit notes; QR ordering | as named | PLN-009, SAL-018, SAL-020 |

## 10. Owner PWA slide mapping

The PWA (`PWA_chairman_app_plan.md`) computes slides server-side; the dictionary is its definition source and DB16
mirrors each slide as an Insights cross-check so numbers can be reconciled.

| Slide | Message | Metric ids | Tier | DB16 chart |
|---|---|---|---|---|
| 1 | Yesterday vs same weekday last week | SAL-001, SAL-003 (+ SAL-006 caveat: Insights compares previous day) | T1 | db16_yesterday |
| 2 | MTD vs target | SAL-007, SAL-021 | T1 / T4 (target) | db16_mtd + banner |
| 3 | Branch ranking | SAL-012 | T3 (1 branch) | db16_branch_rank |
| 4 | Channel mix | SAL-008 | T1 | db16_channel |
| 5 | Top 3 / bottom 3 items | MNU-003, MNU-004 | T1 | db16_top_items, db16_bottom_items |
| 6 | Payment mix | PAY-002 | T1 | db16_pay_mix |
| 7 | Leakage | LKG-001, LKG-002, LKG-006 | T1 / T3 | db16_cancels |
| 8 | Kitchen speed | KIT-003, KIT-004 (KIT-006 when R4 lands) | T2 | db16_kitchen |
| 9 | Cash-up exceptions | PAY-007 | T3 ("All tills balanced") | db16_cashup |
| 10 | Covers and spend per cover | SAL-015, SAL-016 | T2 | db16_covers |
| (new) 11 | Gross margin | MAR-001, MAR-002 with MAR-005 coverage | T2 | db16_margin |

## 11. Build order and dependencies

Wave A (no dependency, proven patterns): DB09 Payments, DB03 Sales deep-dive, DB15 Leakage, DB14 Data quality.
Wave B (enriched sql facts; first builder verifies `fact_sales_lines_enriched` and `dim_item` run and match SQL checks
DQ-CAT and SAL-001 before others copy them): DB04 Menu & category, DB10 Margin & cost, DB05 Department & production.
Wave C (operational): DB02 Branch daily, DB06 Kitchen timing (first to run `fact_kot_exec`), DB07 Table & floor (first to
run `fact_table_sessions`), DB13 Production planning, DB12 Yield, DB11 Wastage & shrinkage.
Wave D (people and roll-ups): DB08 Employee performance, DB01 Owner overview (reuses charts proven in A-C), DB16 Owner
cross-check (after DB01).

Dependencies: every spec copies L1 queries verbatim; any L1 change goes back to `semantic_layer.yaml` first, re-lint
(`--strict`), then propagate. Each builder: catalog -> lint --strict -> compile -> plan -> apply --write -> verify
(--min-rows 1, except queries on T4 facts: wastage) -> reproduce every acceptance SQL in the portfolio -> open the page.
Never `--prune` on first apply. One builder per workbook; no builder edits another's spec.

## 12. Known limits of this design (honest list)

- `sql:` queries (fact_sales_lines_enriched, fact_kot_exec, fact_table_sessions, dim_item) are lint-clean but were not
  executed; output columns are unchecked by lint, and dashboard filter binding on native queries is unverified on 3.15.1.
  Fallback if a filter does not bind: use the builder fact (fact_sales_lines with raw item_group) for that chart.
- Expression functions used in mutates beyond the verified recipes (`if_else` with string results, `day_name`, `cast` on
  `production_time`/`quantity`) follow verified patterns but were not run for these exact columns.
- `ROW_NUMBER() OVER` needs MariaDB 10.2+ (bench MariaDB is newer; not run here).
- Dashboards default Date filter `Last 90 days`; demo data ends 2026-10-21, so acceptance checks run with the Date
  filter cleared.
