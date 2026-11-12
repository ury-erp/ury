# URY restaurant dashboard portfolio (DB01-DB16)

Contract for builders: one workbook + one dashboard + one spec per DB. Copy L1 queries verbatim from
`semantic_layer.yaml` (ids and titles unchanged; drop the probe charts). Metric ids refer to `metric_dictionary.json`;
naming, tiers and rules: `restaurant_analytics_architecture.md`. Chart line format:
`chart_id | type | metric ids | query | x / y (agg) / split | chart filters | grid (x,y,w,h)`.
Grid is 20 columns; filters occupy row y=0 (auto 4x1 cells, so at most 5 filters per row; with 6+ filters charts start at y=2).
Text banner = dashboard `text` item. Every non-T1 section gets its banner; T3/T4 sections get ONLY the banner (no chart)
unless a chart is listed. Default Date filter: `within Last 90 days` (DB02, DB06: `Last 7 days`).
Acceptance: run each SQL read-only on the site DB, then clear the Date filter on the dashboard and compare the
headline number (equal to the rupee/unit). Demo values in brackets are from the research and must be reproduced.

**Data state (read this before the per-dashboard T4 notes below).** The notes below were written when the demo bench had no
wastage, returns, targets, attendance, service charge, self-ordering, bulk production or yield department. The bench has since been
re-seeded and all of those now have rows and are charted (coverage 138/138): URY Wastage (57), URY Sales Target (7), Attendance (844),
URY Ordering Session (18), Bulk Production (14), service-charge tax lines, credit-note returns, yield checks with department and
checker. Where a T4 line below says "no records" or "banner only", treat it as history unless it is repeated here. What is still
empty or a proxy on the demo: cook speed (every ready tap is the Administrator login, which the chart excludes), KOT durations
(stamps are milliseconds apart), committed quantity (no reservations), void disposition on cancelled KOT items (none set), cash
differences on closed shifts (none), commission (not stored on the bill, only tips), queue wait (no queued-at), RevPASH
(seat-hour and table occupancy are proxies), gross margin (estimate from the daily P and L).

## 1. Portfolio matrix (audience x domain; cell = DB id)

| Audience \ Domain | Sales | Menu/Category | Production/Dept | Kitchen timing | Tables | People | Payments | Margin | Waste/Stock | Yield | Plan | Leakage | Data quality |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Owner (company, branch) | DB01, DB16 | DB01 | DB01 | DB01 | - | - | DB01 | DB01 | DB01 | DB01 | DB01 | DB01 | DB14 |
| Branch manager (branch, employee) | DB02, DB03 | DB04 | DB05 | DB02 | DB07 | DB08 | DB09 | - | DB11 | - | DB13 | DB15 | DB14 |
| Kitchen / production head (department, item) | - | DB04 | DB05 | DB06 | - | - | - | - | DB11 | DB12 | DB13 | DB06 | - |
| Finance / controller (company, branch, category) | DB03 | - | - | - | - | - | DB09 | DB10 | DB11 | - | - | DB15 | DB14 |
| Floor / FOH manager (employee, table) | - | - | - | DB06 | DB07 | DB08 | - | - | - | - | - | DB15 | - |

Level coverage: company (DB01, DB16), branch (all), department (DB05, DB06, DB13, DB12-T4), item (DB04, DB10, DB12, DB13),
category (DB04, DB10), employee (DB08, DB09, DB15).

Standard filters (id: label -> column per query):
- `f_date` Date: fact_invoices/fact_sales_lines/fact_sales_lines_enriched/fact_cancellations/fact_payments/fact_closing_details/fact_table_sessions/fact_stock_correction/fact_wastage_lines.posting_date; fact_kot_headers/fact_kot_lines.date; fact_kot_exec.exec_date; fact_sales_plan_items.plan_date; fact_yield_checks.checked_on; fact_daily_pnl.date.
- `f_branch` Branch (string): `branch` on every fact that has it (not dim_table unless listed).
- `f_department` Department: sales facts `department`; fact_kot_headers/fact_kot_lines `production`; fact_kot_exec `department`; plan/yield/wastage `department`.
- `f_category` Category: fact_sales_lines_enriched.menu_category only.
- `f_waiter` Waiter: fact_invoices/fact_cancellations/fact_sales_lines_enriched/fact_table_sessions.waiter.
- `f_order_type` Order Type: fact_invoices/fact_sales_lines/fact_sales_lines_enriched/fact_cancellations/fact_payments.order_type.
- `f_population` Population: `population` on every fact that has it.

---
## DB01 Company / owner overview
Workbook `ury_owner_overview`, title "URY Owner Overview". Audience: owner. Levels: company, branch (+ top items, categories, departments).
Purpose: one page to decide where to look next: is revenue on track, which channel/category/department drives it, are leakage, shrink, yield and SLA in control.
Queries: fact_invoices, fact_sales_lines_enriched, fact_payments, fact_cancellations, fact_kot_headers, fact_sales_plan_items, fact_stock_correction, fact_yield_checks, fact_daily_pnl.
Filters: f_date (Last 90 days, all queries), f_branch (all), f_population (fact_invoices, fact_sales_lines_enriched, fact_payments).
Sections:
- S1 Headline (T1/T2):
  - db01_sales_kpi | Number | SAL-001, SAL-003, SAL-004 | fact_invoices | y SUM(net_total) Net Sales, COUNT(name) Bills, expr sum(net_total)/count(name) ATV | - | (0,1,12,3)
  - db01_mtd_kpi | Number | SAL-007 | fact_invoices | y SUM(net_total), date posting_date month, comparison | - | (12,1,8,3)
- S2 Trend and mix (T1): db01_daily_sales | Line | SAL-005 | fact_invoices | x posting_date day / SUM(net_total) | - | (0,4,12,8); db01_channel | Donut | SAL-008 | fact_invoices | x order_type / SUM(net_total) | - | (12,4,8,8)
- S3 Where revenue comes from: db01_category | Row | MNU-005 | fact_sales_lines_enriched | x menu_category / SUM(net_amount), limit 12, desc | category_family != Non-menu | (0,12,7,9); db01_department (T2) | Row | PRD-001 | fact_sales_lines_enriched | x department / SUM(net_amount) | - | (7,12,7,9); db01_top_items | Row | MNU-003 | fact_sales_lines_enriched | x item_name / SUM(net_amount) limit 10 desc | - | (14,12,6,9)
- S4 Branch and company (T3): db01_branch | Row | SAL-012 | fact_invoices | x branch / SUM(net_total) | - | (0,21,10,6); text banner (10,21,10,6): "**T3** SAL-012: one branch and one company on this site; ranking becomes meaningful when a second branch posts (architecture section 2)."
- S5 Control panel: db01_cancels | Number | LKG-001, LKG-002 | fact_cancellations | COUNT(name), SUM(grand_total) | - | (0,27,5,3); db01_sla (T2) | Number | KIT-004 | fact_kot_headers | expr sum(sla_breach)/sum(is_served) | - | (5,27,5,3); db01_plan | Number | PLN-001 | fact_sales_plan_items | expr sum(fulfilled_qty)/sum(qty) | - | (10,27,5,3); db01_yield | Number | YLD-001 | fact_yield_checks | expr sum(output_qty)/sum(input_qty)*100 | stock_uom = Kg | (15,27,5,3); db01_shrink | Number | STK-001 | fact_stock_correction | SUM(shrink_value), SUM(overage_value) | - | (0,30,7,3); db01_margin (T2) | Number | MAR-001, MAR-002 | fact_daily_pnl | SUM(gross_profit), expr sum(gross_profit)/sum(net_sales) | - | (7,30,7,3); db01_paymix | Donut | PAY-002 | fact_payments | x mode_of_payment / SUM(amount) | - | (14,30,6,6)
- Banner (0,33,14,3): "**T2** margin is from seeded Daily P and L; recipe cost covers about 6-8% of revenue (MAR-005). Wastage (WST-001) is now logged and charted on DB11. Kitchen SLA uses legacy KOT minutes (seeded 12/20 min)."
Acceptance:
- SAL-001: `SELECT ROUND(SUM(net_total),2), COUNT(*) FROM \`tabPOS Invoice\` WHERE docstatus=1 AND is_return=0` [3754065.59, 3177]
- PLN-001: `SELECT SUM(i.fulfilled_qty)/SUM(i.qty) FROM \`tabURY Sales Plan Item\` i WHERE i.docstatus=1` [0.866]
- STK-001: `SELECT SUM(LEAST(amount_difference,0)), SUM(GREATEST(amount_difference,0)) FROM \`tabStock Correction Item\` WHERE docstatus=1` [-14883.2, 15087.2]

## DB02 Branch daily manager
Workbook `ury_branch_daily`, title "URY Branch Daily". Audience: branch manager (opening/closing the day). Levels: branch, employee, department (executed).
Purpose: yesterday/today at a glance: volume, covers, kitchen backlog and SLA, cancellations, tables occupied now, yield alerts.
Queries: fact_invoices, fact_cancellations, fact_kot_headers, dim_table, fact_yield_checks.
Filters: f_date (Last 7 days; fact_invoices, fact_cancellations, fact_kot_headers, fact_yield_checks), f_branch (same + dim_table), f_order_type (fact_invoices, fact_cancellations).
Sections:
- S1 Today vs previous: db02_day_kpi | Number | SAL-006, SAL-003 | fact_invoices | SUM(net_total), COUNT(name), date posting_date day, comparison, sparkline | - | (0,1,10,3); db02_covers (T2) | Number | SAL-015, SAL-016 | fact_invoices | SUM(pax), expr sum(net_total)/sum(pax) | order_type = Dine In, population = Paid, pax > 0 | (10,1,10,3)
- S2 Shape of the day: db02_by_hour | Bar | SAL-009 | fact_invoices | x hour_of_day / COUNT(name), SUM(net_total) | - | (0,4,12,8); db02_daily | Line | SAL-005 | fact_invoices | x posting_date day / SUM(net_total) | - | (12,4,8,8)
- S3 Kitchen now (T2): db02_kot_kpi | Number | KIT-001, KIT-013, KIT-003 | fact_kot_headers | COUNT(name), expr count(name)-sum(is_served), AVG(prod_minutes) | - | (0,12,10,3); db02_sla | Number | KIT-004 | fact_kot_headers | expr sum(sla_breach)/sum(is_served) | - | (10,12,10,3)
- S4 Floor and leakage: db02_occupied | Number | TBL-001 | dim_table | SUM(occupied), COUNT(name) | is_take_away = 0 | (0,15,7,3); db02_cancel | Number | LKG-002 | fact_cancellations | COUNT(name), SUM(grand_total) | - | (7,15,7,3); db02_yield_alert | Number | YLD-006 | fact_yield_checks | SUM(out_of_tolerance), COUNT(name) | - | (14,15,6,3)
- Banner (0,18,20,2): "**T2** Covers are Paid-population only; KOT minutes are legacy production_time (target 10/15 min from POS Profile). Tables occupied is a live snapshot with no history."
Acceptance: SAL-003 per day `SELECT posting_date, COUNT(*), SUM(net_total) FROM \`tabPOS Invoice\` WHERE docstatus=1 AND is_return=0 AND posting_date='2026-10-21' GROUP BY 1`; KIT-001 `SELECT COUNT(*) FROM \`tabURY KOT\` WHERE docstatus=1` [128]; TBL-001 `SELECT SUM(occupied), COUNT(*) FROM \`tabURY Table\` WHERE is_take_away=0` [12 of 19].

## DB03 Sales & revenue deep-dive
Workbook `ury_sales_deepdive`, title "URY Sales Deep-dive". Audience: owner, finance, branch manager. Levels: branch, company, employee (cashier/waiter as filter).
Purpose: understand revenue drivers: trend, channel, hour/weekday demand, basket, populations, price lists.
Queries: fact_invoices.
Filters: f_date, f_branch, f_order_type, f_population, f_waiter (all on fact_invoices).
Sections:
- S1 KPIs: db03_kpi | Number | SAL-001, SAL-003, SAL-004 | fact_invoices | SUM(net_total), COUNT(name), expr ATV, date posting_date month, comparison | - | (0,2,20,3)
- S2 Trend: db03_daily | Line | SAL-005 | x posting_date day / SUM(net_total), split order_type max 5 | - | (0,5,20,8)
- S3 Channel and population: db03_channel | Bar | SAL-008 | x order_type / SUM(net_total), COUNT(name) | - | (0,13,10,8); db03_population | Donut | DQ-001 | x population / SUM(net_total) | - | (10,13,10,8)
- S4 Demand rhythm: db03_hour | Bar | SAL-009 | x hour_of_day / COUNT(name) split population | - | (0,21,10,8); db03_grid | Table | SAL-010 | rows weekday, columns hour_of_day, COUNT(name) | - | (10,21,10,8)
- S5 Basket: db03_basket | Number | SAL-004 | expr sum(total_qty)/count(name) Items per Bill, expr sum(net_total)/count(name) ATV | - | (0,29,10,3); db03_gross_net | Number | SAL-001 | SUM(total) Gross, SUM(net_total) Net, SUM(discount_amount) Discount | - | (10,29,10,3)
- S6 T4 banner (0,32,20,2): "SAL-020 self-order bills (URY Ordering Session, 18 on the demo) and SAL-021 targets (URY Sales Target, 7) are now charted."
Acceptance: SAL-008 `SELECT order_type, COUNT(*), ROUND(SUM(net_total)) FROM \`tabPOS Invoice\` WHERE docstatus=1 AND is_return=0 GROUP BY 1` [Take Away 1,107/1,346,462; Dine In 995/1,233,368; Phone In 610,991; Delivery 559,802; Aggregators 4/3,442]; DQ-001 `... GROUP BY status` [Consolidated 2102 / Paid 1075].

## DB04 Menu & category performance
Workbook `ury_menu_category`, title "URY Menu and Category". Audience: owner, branch manager, kitchen head. Levels: item, category (+ department filter).
Purpose: which dishes and categories earn, which do not sell, what to promote, reprice or drop (with margin where costed).
Queries: fact_sales_lines_enriched, dim_item.
Filters: f_date, f_branch, f_category, f_department, f_order_type (all on fact_sales_lines_enriched).
Sections:
- S1 KPIs: db04_kpi | Number | SAL-001, MNU-002 | fact_sales_lines_enriched | SUM(net_amount) Revenue, SUM(qty) Qty, COUNT_DISTINCT(item_code) Items | - | (0,2,20,3)
- S2 Category: db04_cat_rev | Row | MNU-005 | x menu_category / SUM(net_amount) desc limit 15 | - | (0,5,10,10); db04_family | Donut | MNU-006 | x category_family / SUM(net_amount) | - | (10,5,5,10); db04_unassigned | Number | DQ-003 | SUM(net_amount) | menu_category = Unassigned | (15,5,5,5); db04_bev_attach | Number | MNU-010 | COUNT_DISTINCT(invoice) Beverage Bills | category_family = Beverage | (15,10,5,5)
- S3 Items: db04_top | Row | MNU-003 | x item_name / SUM(net_amount) desc limit 10 | - | (0,15,10,9); db04_bottom | Row | MNU-004 | x item_name / SUM(net_amount) asc limit 10 | category_family != Non-menu | (10,15,10,9)
- S4 Detail: db04_item_table | Table | MNU-009 | rows menu_category, item_name; SUM(qty), SUM(net_amount) | - | (0,24,20,10)
- S5 Margin view (T2): db04_menu_eng | Table | MNU-012, MAR-007 | rows item_name; SUM(qty) Qty, expr sum(est_margin)/sum(qty) Unit Margin, expr sum(est_margin)/sum(costed_net_amount) Margin % | cost_known = 1 | (0,34,12,9); banner (12,34,8,4): "**T2** Margin shown only for items with a default BOM cost (MAR-005 coverage about 6-8% of revenue). Roadmap R2."
- S6 Non-selling (T2): db04_nonselling | Table | MNU-011 | dim_item rows menu_category, item_name; COUNT(item_code) | is_sales_item = 1, is_sold = 0, disabled = 0, category_family != Non-menu | (12,38,8,5)
Acceptance: DQ-CAT `SELECT COUNT(*) FROM (category CASE from semantic_layer.yaml applied to tabItem Group)` and diff both CASE copies textually (must be identical); MNU-005 `SELECT item_group, SUM(net_amount) FROM \`tabPOS Invoice Item\` WHERE docstatus=1 GROUP BY 1` then map with CATEGORY_MAP v1 [All Item Groups 427,664 -> Unassigned; Dessert 90,160 + Desserts 63,200 (+Pastry, Ice cream) -> Desserts]; enriched row count = 10569 lines (equal to submitted non-return lines; any other number means config/BOM fan-out).

## DB05 Department & kitchen production
Workbook `ury_department_production`, title "URY Departments and Production". Audience: kitchen/production head, owner. Levels: department (configured for money, executed for work), item.
Purpose: what each kitchen earns (configured) and what it actually makes (executed); plan attainment and data gaps per department.
Queries: fact_sales_lines_enriched, fact_sales_lines, fact_kot_headers, fact_kot_lines, fact_sales_plan_items.
Filters: f_date (all), f_branch (all), f_department (enriched.department, fact_sales_lines.department, fact_kot_headers.production, fact_kot_lines.production, fact_sales_plan_items.department).
Sections:
- S1 Money by configured department (T2): db05_dept_rev | Row | PRD-001 | fact_sales_lines_enriched | x department / SUM(net_amount) | - | (0,1,10,9); db05_unmapped | Number | DQ-002 | SUM(net_amount) | department = Unmapped | (10,1,5,4); db05_policy | Donut | PRD-003 | x production_policy / SUM(net_amount) | - | (15,1,5,9); db05_warehouse | Donut | PRD-002 | fact_sales_lines | x warehouse / SUM(net_amount) | - | (10,5,5,5)
- S2 Work by executed unit (T1): db05_kots_unit | Row | PRD-004 | fact_kot_headers | x production / COUNT(name) | type != Duplicate | (0,10,10,8); db05_qty_unit | Table | PRD-005 | fact_kot_lines | rows production, item_name; SUM(qty_num) | - | (10,10,10,8)
- S3 Plan by department: db05_plan_dept | Row | PLN-007 | fact_sales_plan_items | x department / expr sum(fulfilled_qty)/sum(qty) | - | (0,18,10,7)
- S4 Banners (10,18,10,7): "Configured department (money) and executed unit (kitchen work) disagree on 74 of 203 KOT lines; they are shown separately on purpose. Wastage by department is on DB11 and yield by station on DB12 (both now have data), so DB05 only links to them. 17.4% of revenue has no configured department: R10."
Acceptance: PRD-001 `SELECT COALESCE(NULLIF(c.department,''),'Unmapped') d, SUM(i.net_amount) FROM \`tabPOS Invoice Item\` i LEFT JOIN \`tabURY Item Production Configuration\` c ON c.item=i.item_code AND c.active=1 WHERE i.docstatus=1 GROUP BY 1` [Indian Kitchen 2,866,914; Unmapped 654,410; Chinese 126,320]; PRD-004 `SELECT production, COUNT(*) FROM \`tabURY KOT\` WHERE docstatus=1 GROUP BY 1`.

## DB06 Kitchen timing & KOT SLA
Workbook `ury_kitchen_sla`, title "URY Kitchen Timing and SLA". Audience: kitchen head, floor manager. Levels: department (executed unit), branch, company.
Purpose: is the kitchen inside the KOT target (10/15 min), where tickets stall, what gets cancelled at which stage.
Queries: fact_kot_headers, fact_kot_exec, fact_kot_lines.
Filters: f_date (Last 7 days; date / exec_date / date), f_branch (all), f_department (fact_kot_headers.production, fact_kot_exec.department, fact_kot_lines.production).
Sections:
- S1 SLA (T2): db06_kpi | Number | KIT-001, KIT-003, KIT-004 | fact_kot_headers | COUNT(name), AVG(prod_minutes), expr sum(sla_breach)/sum(is_served) | - | (0,1,12,3); db06_target | Table | KIT-004 | fact_kot_headers | rows pos_profile; MAX(custom_kot_warning_time) Target, AVG(prod_minutes) Actual | is_served = 1 | (12,1,8,5)
- S2 Load (T1): db06_by_hour | Bar | KIT-017 | fact_kot_headers | x hour_of_day / COUNT(name) split production max 8 | - | (0,4,12,8); db06_unit | Row | PRD-004 | fact_kot_headers | x production / COUNT(name) | - | (12,6,8,6)
- S3 Flow (T1 counts): db06_funnel | Funnel | KIT-011 | fact_kot_exec | measures SUM(was_started), SUM(was_ready), SUM(was_served) (if Funnel needs x/y: Table with the three measures) | - | (0,12,10,8); db06_cancel_stage | Bar | KIT-012 | fact_kot_exec | x state / COUNT(name) | is_cancelled = 1 | (10,12,10,8)
- S4 Ticket health: db06_open | Number | KIT-013 | fact_kot_headers | expr count(name)-sum(is_served) | - | (0,20,7,3); db06_modified | Number | KIT-014 | fact_kot_headers | COUNT(name) | type = Order Modified | (7,20,6,3); db06_voids | Number | KIT-015 | fact_kot_lines | SUM(cancelled_qty_num) | - | (13,20,7,3)
- S5 Execution durations (T3, banner only) (0,23,20,3): "**T3** KIT-006 prep, KIT-010 order-to-serve, KIT-018 item speed: URY KOT Execution stamps on this site are milliseconds apart (seeded); **T4** KIT-009 queue wait needs a queued_at field. Durations will be read from fact_kot_exec (TIMESTAMPDIFF) once roadmap R4 lands."
Acceptance: `SELECT p.name, p.custom_kot_warning_time FROM \`tabPOS Profile\` p` [URY 15, URY Branch 10]; KIT-011 dedup `SELECT COUNT(DISTINCT kot, production_unit) FROM \`tabURY KOT Execution\`` [93] and states (started 48 / ready 42 / served 36 before dedup); KIT-003 `SELECT AVG(CAST(production_time AS DECIMAL(10,2))) FROM \`tabURY KOT\` WHERE docstatus=1 AND order_status='Served'`.

## DB07 Table & floor timing
Workbook `ury_tables_floor`, title "URY Tables and Floor". Audience: floor/FOH manager, branch manager. Levels: branch, employee (waiter), table/room.
Purpose: which tables and rooms earn, how long orders stay open, covers and spend per cover, what is missing for utilisation.
Queries: fact_table_sessions, dim_table, fact_invoices.
Filters: f_date (fact_table_sessions, fact_invoices), f_branch (all three), f_waiter (fact_table_sessions, fact_invoices), f_population (fact_table_sessions, fact_invoices).
Sections:
- S1 Floor (T1): db07_kpi | Number | TBL-002 | fact_table_sessions | COUNT(name) Dine-in Bills, SUM(net_total) | is_take_away = 0 | (0,1,10,3); db07_occupied | Number | TBL-001 | dim_table | SUM(occupied), COUNT(name) | is_take_away = 0 | (10,1,10,3)
- S2 Revenue by place: db07_room | Donut | TBL-007 | fact_table_sessions | x room / SUM(net_total) | is_take_away = 0 | (0,4,8,9); db07_table | Row | TBL-006 | x restaurant_table / SUM(net_total) limit 20 | is_take_away = 0 | (8,4,12,9)
- S3 Covers (T2): db07_covers | Number | SAL-015, SAL-016 | fact_invoices | SUM(pax), expr sum(net_total)/sum(pax) | order_type = Dine In, population = Paid, pax > 0 | (0,13,10,3)
- S4 Dwell (T2): db07_dwell | Number | TBL-004, DQ-005 | fact_table_sessions | AVG(dwell_minutes) Dwell (valid), SUM(dwell_valid) Valid Bills, COUNT(name) All | dwell_valid = 1 for the AVG chart only (put COUNT in db07_dq) | (10,13,10,3); db07_turns | Line | TBL-003 | fact_table_sessions | x posting_date day / expr count(name)/distinct_count(restaurant_table) | is_take_away = 0 | (0,16,20,7)
- S5 Banner (0,23,20,3): "**T2** Dwell = invoice creation to payment (not seat to clear); half the demo dine-in bills have 00:00:00 and the rest are seeded at ~30 min. **T3** TBL-008 over-capacity, TBL-011 service response (4 requests). **T4** TBL-009 RevPASH and TBL-010 utilisation need opening hours (R9) and seat/clear stamps (R5)."
Acceptance: `SELECT COUNT(*), SUM(TIME_TO_SEC(total_spend_time)>0) FROM \`tabPOS Invoice\` WHERE docstatus=1 AND order_type='Dine In'` [995, 493]; TBL-007 `SELECT t.restaurant_room, SUM(p.net_total) FROM \`tabPOS Invoice\` p JOIN \`tabURY Table\` t ON t.name=p.restaurant_table WHERE p.docstatus=1 AND p.order_type='Dine In' AND t.is_take_away=0 GROUP BY 1`.

## DB08 Employee performance (waiter / cashier)
Workbook `ury_employee_performance`, title "URY Staff Performance". Audience: owner, branch manager only (restricted, section 7). Levels: employee (User), branch.
Purpose: coaching and fairness: who sells, upsells, serves covers, cancels; cashier settlement. Indicators, not verdicts.
Queries: fact_invoices, fact_sales_lines_enriched, fact_cancellations, fact_closing_details, fact_daily_pnl.
Filters: f_date (all), f_branch (all), f_waiter (fact_invoices, fact_sales_lines_enriched, fact_cancellations), f_order_type (fact_invoices, fact_sales_lines_enriched).
Every waiter chart has chart filter `population = Paid` (Consolidated waiter is synthetic).
Sections:
- S1 Waiters (T1): db08_sales | Row | EMP-001 | fact_invoices | x waiter / SUM(net_total) | population = Paid | (0,1,10,8); db08_bills_atv | Table | EMP-002, EMP-003 | fact_invoices | rows waiter; COUNT(name), expr sum(net_total)/count(name), expr sum(total_qty)/count(name) | population = Paid | (10,1,10,8)
- S2 Upsell: db08_mix | Bar | EMP-007 | fact_sales_lines_enriched | x waiter / SUM(net_amount) split category_family | population = Paid | (0,9,12,8); db08_covers (T2) | Table | EMP-004, EMP-005 | fact_invoices | rows waiter; SUM(pax), expr sum(net_total)/sum(pax) | population = Paid, order_type = Dine In, pax > 0 | (12,9,8,8)
- S3 Leakage owners: db08_cancels | Row | EMP-008 | fact_cancellations | x waiter / COUNT(name), SUM(grand_total) | - | (0,17,10,7)
- S4 Cashiers: db08_cashier | Row | EMP-009 | fact_invoices | x cashier / SUM(net_total) | - | (10,17,10,7); db08_cashup (T3) | Row | EMP-010 | fact_closing_details | x user / SUM(difference) | - | (0,24,10,6); db08_labour (T2) | Number | EMP-012 | fact_daily_pnl | expr sum(total_employee_costs)/sum(net_sales) | - | (10,24,10,3)
- S5 Banner (10,27,10,3) + (0,30,20,2): "Employee = Frappe user; HR Employee links exist for 2 people only (R3). **T3** EMP-010 cash-up shows no differences on the demo (the table lists only shifts with a difference); EMP-011 discounts are small. EMP-013 cook speed stays empty on the demo (actors all Administrator, R4). EMP-014 sales per labour hour (attendance hours) and EMP-015 tips are charted; commission is not stored on the bill, so only tips show (R12)."
Acceptance: EMP-001 `SELECT waiter, COUNT(*), SUM(net_total) FROM \`tabPOS Invoice\` WHERE docstatus=1 AND is_return=0 AND status<>'Consolidated' GROUP BY 1` [imran.ansari 363/505,635; info@tridz.com 284/414,720; suraj.yadav 175/232,665; urycaptain 141/203,460; uryrm 107/138,000]; EMP-008 `SELECT waiter, COUNT(*) FROM \`tabPOS Invoice\` WHERE docstatus=2 GROUP BY 1` [imran 18, info@tridz 16, suraj 15, urycaptain 8, uryrm 3].

## DB09 Payments & cash-up
Workbook `ury_payments_cashup`, title "URY Payments and Cash-up". Audience: finance, branch manager. Levels: branch, employee (cashier/closing user).
Purpose: tender mix, money collected vs billed, till accuracy, sales not yet closed.
Queries: fact_payments, fact_invoices, fact_closing_details.
Filters: f_date (all), f_branch (all), f_order_type (fact_payments, fact_invoices), `f_mode` Mode of Payment (fact_payments.mode_of_payment, fact_closing_details.mode_of_payment).
Sections:
- S1 KPIs: db09_tender | Number | PAY-001 | fact_payments | SUM(amount), COUNT(parent) | - | (0,1,7,3); db09_collected | Number | PAY-004 | fact_invoices | SUM(paid_amount), SUM(change_amount), SUM(rounded_total) | - | (7,1,7,3); db09_unclosed | Number | PAY-008 | fact_invoices | SUM(net_total), COUNT(name) | population = Paid | (14,1,6,3)
- S2 Mix: db09_mode | Donut | PAY-002 | fact_payments | x mode_of_payment / SUM(amount) | - | (0,4,7,9); db09_mode_ot | Bar | PAY-003 | x order_type / SUM(amount) split mode_of_payment, stack | - | (7,4,13,9)
- S3 Cash-up: db09_exp_counted | Line | PAY-006 | fact_closing_details | x posting_date day / SUM(expected_amount), SUM(closing_amount) | - | (0,13,12,8); db09_variance (T3) | Number | PAY-007 | SUM(difference), SUM(has_variance) | - | (12,13,8,3); db09_cashier | Row | EMP-009 | fact_invoices | x cashier / SUM(net_total) | - | (12,16,8,5)
- Banner (0,21,20,2): "**T3** All 308 closing lines balance to 0 on this site (seeded). Closings cover Consolidated bills only; Paid bills are 'unclosed sales'. Closing branch comes from the POS Opening Entry."
Acceptance: PAY-001 `SELECT SUM(amount) FROM \`tabSales Invoice Payment\` WHERE parenttype='POS Invoice' AND docstatus=1` [3,761,645.48 tendered]; PAY-004 `SELECT SUM(paid_amount)-SUM(change_amount), SUM(rounded_total) FROM \`tabPOS Invoice\` WHERE docstatus=1` [3,754,042.00 both]; PAY-007 `SELECT COUNT(*), SUM(difference<>0) FROM \`tabPOS Closing Entry Detail\` WHERE docstatus=1` [308, 0].

## DB10 Margin & cost (tiered)
Workbook `ury_margin_cost`, title "URY Margin and Cost". Audience: owner, finance. Levels: company, branch, category, item, department.
Purpose: what we earn after food cost, at the best available tier, with coverage stated beside every number.
Queries: fact_daily_pnl, fact_sales_lines_enriched, dim_item.
Filters: f_date (fact_daily_pnl.date, enriched.posting_date), f_branch (both), f_category (enriched), f_department (enriched).
Sections:
- S0 Tier banner (0,1,20,2): "Margin tiers: P and L (T2, seeded) > recipe estimate (T2, costed items only) > GL/stock (T4). Read every margin next to its coverage."
- S1 P and L (T2): db10_pnl_kpi | Number | MAR-001, MAR-002, MAR-003 | fact_daily_pnl | SUM(gross_profit), expr sum(gross_profit)/sum(net_sales), expr sum(cogs)/sum(net_sales) | - | (0,3,12,3); db10_labour | Number | EMP-012 | expr sum(total_employee_costs)/sum(net_sales) | - | (12,3,8,3); db10_pnl_trend | Line | MAR-003, MAR-004 | x date week / expr sum(cogs)/sum(net_sales), SUM(net_profit) | - | (0,6,20,8)
- S2 Recipe estimate (T2): db10_coverage | Number | MAR-005, DQ-007 | fact_sales_lines_enriched | expr sum(costed_net_amount)/sum(net_amount) Coverage, SUM(costed_net_amount) | - | (0,14,7,3); db10_est | Number | MAR-006, MAR-007 | SUM(est_margin), expr sum(est_margin)/sum(costed_net_amount) | cost_known = 1 | (7,14,13,3); db10_cat_cost | Bar | MAR-008 | x menu_category / SUM(est_cost), SUM(est_margin) | cost_known = 1 | (0,17,10,9); db10_menu_eng | Table | MNU-012 | rows item_name; SUM(qty), expr sum(est_margin)/sum(qty), expr sum(est_margin)/sum(costed_net_amount) | cost_known = 1 | (10,17,10,9)
- S3 T3/T4 banner (0,26,20,3): "**T3** MAR-012 theoretical vs counted cost (8 seeded snapshots). **T4** MAR-010 GL food cost and MAR-011 stock consumption: POS invoices post no COGS and 91% of stock movements are valued at zero. Roadmap R2, R11."
Acceptance: MAR-002 `SELECT SUM(gross_profit)/SUM(net_sales) FROM \`tabURY Daily P and L\` WHERE docstatus=1`; MAR-005 `SELECT SUM(CASE WHEN b.item IS NOT NULL THEN i.net_amount END)/SUM(i.net_amount) FROM \`tabPOS Invoice Item\` i LEFT JOIN (SELECT DISTINCT item FROM \`tabBOM\` WHERE is_default=1 AND is_active=1 AND docstatus=1 AND raw_material_cost>0) b ON b.item=i.item_code WHERE i.docstatus=1` [~0.06-0.08].

## DB11 Wastage & shrinkage
Workbook `ury_waste_shrink`, title "URY Wastage and Shrinkage". Audience: kitchen head, finance. Levels: item, category (raw), branch, department (wastage, T4).
Purpose: what is lost in counts and in the kitchen, by item and reason.
Queries: fact_stock_correction, fact_wastage_lines, fact_kot_exec.
Filters: f_date (fact_stock_correction.posting_date, fact_wastage_lines.posting_date, fact_kot_exec.exec_date), f_branch (all), `f_item` Item (fact_stock_correction.item_code, fact_wastage_lines.item_code).
Sections:
- S1 Shrinkage (T1): db11_kpi | Number | STK-001, STK-002, STK-003 | fact_stock_correction | SUM(shrink_value), SUM(overage_value), SUM(amount_difference) | - | (0,1,12,3); db11_pct | Number | STK-004 | expr (sum(overage_value)-sum(shrink_value))/sum(current_amount) | - | (12,1,8,3); db11_by_item | Bar | STK-005 | x item_name / SUM(shrink_value), SUM(overage_value) | - | (0,4,12,9); db11_by_reason | Donut | STK-006 | x reason / SUM(amount_difference) | - | (12,4,8,9)
- S2 Kitchen waste proxy (T2): db11_wasted_prep | Number | WST-007 | fact_kot_exec | SUM(wasted_prep) | - | (0,13,6,3)
- S3 Wastage (T4, banner only) (6,13,14,4): "WST-001..005 wastage value, reasons, % of sales and by department are charted from fact_wastage_lines (57 entries on the demo). KIT-016 void disposition is still unset on every line, so that donut is empty."
- S4 Data counter: db11_waste_rows | Number | DQ-010 | fact_wastage_lines | COUNT(name) | - | (0,16,6,3)
Note: verify with `--min-rows 0` for fact_wastage_lines only. STK-007 days of cover T4 (banner sentence in S3).
Acceptance: STK-003 `SELECT SUM(amount_difference), SUM(ABS(amount_difference)), SUM(current_amount) FROM \`tabStock Correction Item\` WHERE docstatus=1` [204.0, 29,970.4, ~1,208,046]; `SELECT COUNT(*) FROM \`tabURY Wastage\`` [0].

## DB12 Yield & recipe adherence
Workbook `ury_yield`, title "URY Yield". Audience: kitchen/production head. Levels: item, category (raw), branch, department, checker.
Purpose: which raw materials under-yield vs standard, how often checks fail tolerance, trend.
Queries: fact_yield_checks, fact_stock_correction.
Filters: f_date (fact_yield_checks.checked_on, fact_stock_correction.posting_date), f_branch (both), `f_uom` UOM (fact_yield_checks.stock_uom; default Kg so weights are not mixed with litres), `f_item` (fact_yield_checks.item, fact_stock_correction.item_code).
Sections:
- S1 KPIs (T1): db12_kpi | Number | YLD-001, YLD-002, YLD-005, YLD-006 | fact_yield_checks | expr sum(output_qty)/sum(input_qty)*100 Actual, expr sum(expected_output)/sum(input_qty)*100 Standard, expr sum(below_standard)/count(name), expr sum(out_of_tolerance)/count(name) | - | (0,1,20,3)
- S2 By item: db12_gap | Bar | YLD-003 | x item_name / expr sum(output_qty - expected_output)/sum(input_qty)*100 Gap pts | - | (0,4,10,9); db12_loss | Row | YLD-004 | x item_name / SUM(yield_loss_qty) | - | (10,4,10,9)
- S3 Trend: db12_trend | Line | YLD-007 | x checked_on week / expr sum(output_qty)/sum(input_qty)*100 split item_name max 6 | - | (0,13,20,8)
- S4 Link to counts: db12_count_var | Bar | STK-005 | fact_stock_correction | x item_name / SUM(amount_difference) | - | (0,21,10,7); banner (10,21,10,7): "YLD-008 by department and yield by checker are charted (department and checker are now set on the checks). **T3** YLD-009 loss cost and YLD-010 cadence compliance. Tolerance = 5 points (architecture constant)."
Acceptance: YLD-001 `SELECT item, SUM(output_qty)/SUM(input_qty)*100, SUM(input_qty*standard_yield_percent_snapshot/100)/SUM(input_qty)*100 FROM \`tabURY Yield Check\` GROUP BY 1` [Atta 89.9 vs 92; Chicken 90.3 vs 90; Brownie 87.9 vs 88; Butter 97.1 vs 98; Coconut Milk 91.8 vs 94; Basmati 92.2 vs 95]; total `SELECT SUM(input_qty), SUM(output_qty)` [1198.3, 1094.8].

## DB13 Production planning (plan vs actual)
Workbook `ury_production_plan`, title "URY Production Planning". Audience: kitchen head, branch manager. Levels: department, item, branch.
Purpose: did we produce what we planned; where are the misses, by department, item, service period and enforcement mode; did misses cost sales.
Queries: fact_sales_plan_items, fact_sales_lines, fact_cancellations.
Filters: f_date (plan_date, posting_date, posting_date), f_branch (all), f_department (fact_sales_plan_items.department, fact_sales_lines.department).
Sections:
- S1 KPIs (T1): db13_kpi | Number | PLN-001, PLN-002 | fact_sales_plan_items | expr sum(fulfilled_qty)/sum(qty), SUM(qty), SUM(fulfilled_qty) | - | (0,1,12,3); db13_oos | Number | LKG-007 | fact_cancellations | COUNT(name) | cancel_reason = Kitchen out of stock | (12,1,8,3)
- S2 Misses: db13_under | Row | PLN-004 | x item_code / SUM(under_qty) limit 15 | - | (0,4,10,9); db13_over | Row | PLN-005 | x item_code / SUM(over_qty) limit 15 | - | (10,4,10,9)
- S3 Shape: db13_dept | Row | PLN-007 | x department / expr sum(fulfilled_qty)/sum(qty) | - | (0,13,7,8); db13_period | Bar | PLN-008 | x service_period / expr ratio split enforcement_mode | - | (7,13,7,8); db13_trend | Line | PLN-001 | x plan_date day / expr ratio | - | (14,13,6,8)
- S4 Plan vs POS (T2): db13_planned_items | Row | PLN-010 | fact_sales_plan_items | x item_code / SUM(qty) limit 15 | - | (0,21,10,8); db13_sold_items | Row | PLN-010 | fact_sales_lines | x item_code / SUM(qty) limit 15 | - | (10,21,10,8)
- Banner (0,29,20,2): "**T2** Plan vs POS shown side by side, not joined. **T3** PLN-009 committed qty is still 0 on all lines (no reservations). PRD-008 bulk production cost is charted (14 runs). fulfilled_qty is a counter with no history."
Acceptance: `SELECT SUM(qty), SUM(fulfilled_qty), SUM(GREATEST(qty-fulfilled_qty,0)), SUM(GREATEST(fulfilled_qty-qty,0)) FROM \`tabURY Sales Plan Item\` WHERE docstatus=1` [4200, 3639, then under/over]; LKG-007 `SELECT COUNT(*) FROM \`tabPOS Invoice\` WHERE docstatus=2 AND cancel_reason='Kitchen out of stock'` [13].

## DB14 Data quality & capture readiness
Workbook `ury_data_quality`, title "URY Data Quality". Audience: data owner, owner (monthly). Levels: per level (one row per level: what is missing).
Purpose: show, per level and domain, which numbers are trustworthy and what to capture next; this is the roadmap's scoreboard.
Queries: fact_invoices, fact_sales_lines_enriched, fact_table_sessions, fact_kot_exec, fact_yield_checks, fact_wastage_lines, dim_item, fact_sales_plan_items.
Filters: f_date (fact_invoices, fact_sales_lines_enriched, fact_table_sessions, fact_kot_exec.exec_date, fact_yield_checks.checked_on, fact_wastage_lines), f_branch (same).
Sections:
- S0 Readiness table (text, 0,1,20,8): one markdown table, rows = six levels x columns Sales/Kitchen/Margin/Waste/Yield/Tables/People with the tier from the dictionary (company T3 multi, branch T3 multi, department T2 sales / T1 kitchen counts / T4 yield+waste, item T1, category T1 cleaned, employee T1 Paid-only / T4 HR) and the roadmap id per gap.
- S1 Populations and attribution: db14_population | Donut | DQ-001 | fact_invoices | x population / COUNT(name) | - | (0,9,6,8); db14_pax | Bar | DQ-004 | fact_invoices | x population / COUNT(name) Bills, SUM(pax) Covers | order_type = Dine In | (6,9,7,8); db14_emp_link | Number | DQ-006 | fact_invoices | COUNT(name) | custom_waiter_employee is_set | (13,9,7,4); db14_branches | Number | DQ-011 | fact_invoices | COUNT_DISTINCT(branch), COUNT_DISTINCT(company) | - | (13,13,7,4)
- S2 Mapping gaps: db14_unmapped | Number | DQ-002, DQ-003 | fact_sales_lines_enriched | SUM(net_amount) | department = Unmapped (second tile: menu_category = Unassigned) | (0,17,10,3) and db14_unassigned (10,17,10,3); db14_recipe | Number | DQ-007, MAR-005 | dim_item | SUM(has_recipe_cost), COUNT(item_code) | is_sold = 1 | (0,20,10,3); db14_plan_ctrl | Number | PLN-011 | dim_item | SUM(controlled_by_sales_plan) | - | (10,20,10,3)
- S3 Capture counters: db14_dwell | Number | DQ-005 | fact_table_sessions | SUM(dwell_valid), COUNT(name) | - | (0,23,5,3); db14_actor | Number | DQ-008 | fact_kot_exec | COUNT(name) | started_by != Administrator, started_by is_set | (5,23,5,3); db14_yield_dept | Number | DQ-009 | fact_yield_checks | COUNT(name) | department is_set | (10,23,5,3); db14_waste | Number | DQ-010 | fact_wastage_lines | COUNT(name) | - | (15,23,5,3)
- S4 Non-selling and over-capacity: db14_nonselling | Table | MNU-011 | dim_item | rows menu_category; COUNT(item_code) | is_sales_item=1, is_sold=0, disabled=0 | (0,26,10,7); banner (10,26,10,7): roadmap R1-R15 summary with the metric ids each unlocks (copy architecture section 9, ranks only).
Acceptance: DQ-002 [654,410 / 3,754,066 = 17.4%]; DQ-003 [427,664 = 11.4%]; DQ-006 `SELECT SUM(custom_waiter_employee IS NOT NULL AND custom_waiter_employee<>'') FROM \`tabPOS Invoice\` WHERE docstatus=1` [2243]; dim_item sold items with recipe [10 of 181 per RD3 sample; reproduce exactly].

## DB15 Leakage (cancellations, voids, discounts, zero bills)
Workbook `ury_leakage`, title "URY Leakage". Audience: owner, finance, branch manager. Levels: employee, branch, department (KOT side).
Purpose: money and food lost to cancellations, voids, discounts and zero bills; who and why.
Queries: fact_cancellations, fact_invoices, fact_kot_exec, fact_kot_headers, fact_kot_lines.
Filters: f_date (all; exec_date/date for KOT facts), f_branch (all), f_waiter (fact_cancellations, fact_invoices), f_order_type (fact_cancellations, fact_invoices).
Sections:
- S1 KPIs (T1): db15_kpi | Number | LKG-001, LKG-002 | fact_cancellations | COUNT(name), SUM(grand_total) | - | (0,1,8,3); db15_base | Number | SAL-001, SAL-014 | fact_invoices | SUM(net_total) (denominator for LKG-003), SUM(is_zero_bill) | - | (8,1,6,3); db15_disc (T3) | Number | LKG-006 | fact_invoices | SUM(discount_amount), SUM(has_discount) | - | (14,1,6,3)
- S2 Why and where: db15_reason | Row | LKG-004 | fact_cancellations | x cancel_reason / COUNT(name), SUM(grand_total) | - | (0,4,10,8); db15_ot | Donut | LKG-005 | x order_type / COUNT(name) | - | (10,4,5,8); db15_trend | Bar | LKG-001 | x posting_date week / COUNT(name) | - | (15,4,5,8)
- S3 Who: db15_waiter | Row | EMP-008 | fact_cancellations | x waiter / SUM(grand_total) | - | (0,12,10,7); db15_disc_cashier (T3) | Row | EMP-011 | fact_invoices | x cashier / SUM(discount_amount) | has_discount = 1 | (10,12,10,7)
- S4 Kitchen side: db15_stage | Bar | KIT-012, WST-007 | fact_kot_exec | x state / COUNT(name) | is_cancelled = 1 | (0,19,7,7); db15_modified | Number | KIT-014 | fact_kot_headers | COUNT(name) | type = Order Modified | (7,19,6,3); db15_voids | Number | KIT-015 | fact_kot_lines | SUM(cancelled_qty_num) | - | (13,19,7,3)
- Banner (7,22,13,4): "Waiter = order owner, not necessarily the canceller (not stored, R14). **T3** discounts: 4 bills, 31.89 total. SAL-018 returns are charted from credit notes. Cancel reason is free text."
Acceptance: `SELECT cancel_reason, COUNT(*), SUM(grand_total) FROM \`tabPOS Invoice\` WHERE docstatus=2 GROUP BY 1` [60 / 87,680.00; mistake 14, out of stock 13, duplicate 12, payment 11, changed mind 10]; `SELECT COUNT(*), SUM(discount_amount) FROM \`tabPOS Invoice\` WHERE docstatus=1 AND discount_amount>0` [4, 31.89]; zero bills `... AND grand_total=0` [18].

## DB16 Owner brief cross-check
Workbook `ury_chairman_crosscheck`, title "URY DB16 Owner Crosscheck". Audience: owner (drill-down from the PWA), data owner (reconciliation). Levels: company, branch.
Purpose: one chart per PWA slide (architecture section 10) so each slide number can be reconciled with Insights and drilled into. Not a replacement for the PWA (which computes same-weekday deltas and targets).
Queries: fact_invoices, fact_sales_lines_enriched, fact_payments, fact_cancellations, fact_kot_headers, fact_closing_details, fact_daily_pnl.
Filters: f_date (all), f_branch (all).
Sections (one row per slide, all h=6 unless noted):
- db16_yesterday | Number | SAL-001, SAL-003 | fact_invoices | SUM(net_total), COUNT(name), date posting_date day, comparison | - | (0,1,10,3)
- db16_mtd | Number | SAL-007 | fact_invoices | SUM(net_total), date posting_date month, comparison | - | (10,1,10,3)
- db16_branch_rank (T3) | Row | SAL-012 | fact_invoices | x branch / SUM(net_total) | - | (0,4,10,6)
- db16_channel | Donut | SAL-008 | fact_invoices | x order_type / SUM(net_total) | - | (10,4,10,6)
- db16_top_items | Row | MNU-003 | fact_sales_lines_enriched | x item_name / SUM(net_amount) desc limit 3 | category_family != Non-menu | (0,10,10,6)
- db16_bottom_items | Row | MNU-004 | same, asc limit 3 | category_family != Non-menu | (10,10,10,6)
- db16_pay_mix | Donut | PAY-002 | fact_payments | x mode_of_payment / SUM(amount) | - | (0,16,10,6)
- db16_cancels | Number | LKG-001 | fact_cancellations | COUNT(name), SUM(grand_total) | - | (10,16,10,3)
- db16_kitchen (T2) | Number | KIT-003, KIT-004 | fact_kot_headers | AVG(prod_minutes), expr sum(sla_breach)/sum(is_served) | is_served = 1 | (10,19,10,3)
- db16_cashup (T3) | Number | PAY-007 | fact_closing_details | SUM(difference), SUM(has_variance) | - | (0,22,10,3)
- db16_covers (T2) | Number | SAL-015, SAL-016 | fact_invoices | SUM(pax), expr sum(net_total)/sum(pax) | order_type = Dine In, population = Paid, pax > 0 | (10,22,10,3)
- db16_margin (T2) | Number | MAR-001, MAR-002 | fact_daily_pnl | SUM(gross_profit), expr sum(gross_profit)/sum(net_sales) | - | (0,25,10,3)
- Banner (10,25,10,3): "Slide 1 compares the same weekday last week in the PWA; Insights compares the previous day. Slide 2 target: no target table yet (SAL-021, R13)."
Acceptance: the PWA P0 truth file (proof/brief_sql_truth.txt) must equal db16_yesterday for a pinned date (2026-10-21) and SAL-001 SQL with `posting_date='2026-10-21'`.

## DB17 Customer analysis
Workbook `ury_db17_customer_analysis`, title "Customer analysis". Audience: branch manager, owner, marketing. Levels: branch, customer.
Purpose: Guest retention, new vs repeat customer acquisition, guest phone collection rates, and guest lifetime value.
Queries: fact_customer_visits, fact_customer_daily.
Filters: f_date (default: Last 30 days), f_branch.
Sections:
- S1 KPIs: Total active customers, New customers acquired, Repeat customer visits, Repeat visit rate %, Customer contacts collected, Data collection rate %, Customer net sales, Average customer dwell time.
- S2 Daily trends: Daily new customers acquired (Line), Daily repeat customers returning (Line).
- S3 Mix & Share: Visits by customer type (Donut), Guest phone collection status (Donut), Customer visits by order type (Donut).
- S4 Branch: Customer contacts collected by branch (Bar), Repeat customer visits by branch (Bar).
- S5 Top Guests: Top 10 customers by net spend (Row), Top 10 most frequent guests (Row).
- S6 Roster: Customer directory & spend summary (Table).

## Builder checklist (every DB)
1. Copy only the L1 queries listed; ids/titles unchanged; no new joins. 2. Charts per the lines above; non-T1 chart titles end with the tier tag. 3. Filters per the standard map; every `applies_to` query must have a chart on the dashboard (L13). 4. `lint --strict` clean with a fresh catalog; compile; plan; apply --write; verify (min-rows 1; 0 only for fact_wastage_lines); reproduce each acceptance SQL; open the page and screenshot. 5. Report any `sql:` query whose dashboard filter does not bind (architecture section 12) instead of working around it.
