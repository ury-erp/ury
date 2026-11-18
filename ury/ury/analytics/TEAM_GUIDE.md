# URY Analytics: team guide

16 owner/manager dashboards for URY, shown inside the Frappe desk under **Analytics > URY Analytics**.
Read `DEPENDENCIES.md` first for the Frappe/Insights versions and the Frappe patch.

## What is in it

Owner overview, Branch daily, Sales deep-dive, Menu & category, Department & production, Kitchen timing,
Tables & floor, Staff performance, Payments & cash-up, Margin & cost, Wastage & shrinkage, Yield & recipe,
Production planning, Data readiness, Leakage, Chairman (owner) cross-check.
Specs: `dashboards/*.yaml` (one per dashboard). Each page has a filter row, number cards, charts and tables;
charts are tall, tables sit on their own rows.

## How to use (end users)

1. Open **Analytics** in the dock, pick a dashboard in the sidebar.
2. Use the filters at the top (date range, branch). Branches are MG Road Branch and Airport Branch on the demo site.
3. Access: a user needs a role that can read the desk `Dashboard` doc and an Insights role. Without the Insights
   role the page shows "You don't have access to this dashboard".

## How to apply (developers)

Prerequisites: a bench with the versions in `DEPENDENCIES.md`, ERPNext + URY installed (or the URY tables
readable), and the finsights tool from https://github.com/tridz-dev/frappe_insights_skill (`skills/frappe-insights/scripts/finsights`).

```bash
cd <frappe_insights_skill>/skills/frappe-insights
SPECS=<ury app>/ury/ury/analytics/dashboards
export INSIGHTS_URL=http://localhost:8000 INSIGHTS_USER=Administrator INSIGHTS_PASSWORD=*** \
       INSIGHTS_DATA_SOURCE="Site DB"            # use ury_db if the site has no DocTypes for the tables
F=scripts/finsights
for S in $SPECS/DB*.yaml; do
  $F --spec $S catalog -o /tmp/cat.json
  $F --spec $S lint --strict --catalog /tmp/cat.json
  $F --spec $S --write apply
  $F --spec $S verify --min-rows 1
done
```

Then make them appear in the desk (one desk `Dashboard` doc per Insights dashboard, a Sidebar `URY Analytics`
with Dashboard links, and an "Analytics" Dock item): run
`bench --site SITE execute ury.ury.desk_islands.setup` (creates the desk Dashboard docs, the sidebar and the dock item). Open `/desk/ury-analytics/dashboard-view/ury-owner-overview`.

## Seed demo data to look at

```bash
bench --site SITE execute ury.ury.dev_seed.day_seed.seed_day --kwargs "{'date': 'yesterday'}"
```
(`date`: today, yesterday, -N, or YYYY-MM-DD; `branch`, `orders`, `replace` optional.) Lives in `ury/ury/dev_seed/day_seed.py`.

## Known limits

Banner text is truncated to one line, the dock icon may render blank, dark-mode bars are low contrast.
