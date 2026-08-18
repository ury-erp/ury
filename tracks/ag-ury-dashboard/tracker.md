# Tracker: URY Dashboard for Small Restaurant & Café Management System

**Track**: `ag-ury-dashboard`  
**Owner**: `antigravity`  
**Location**: `<url>/ury`  
**Branch**: `feat/minimal-installation`  
**Started**: 2026-08-06  

---

## Tasks

### Setup & Infrastructure
- [x] Create track directory `tracks/ag-ury-dashboard/` with `plan.md` and `tracker.md`
- [x] Update workspace `index.md` to register `ag-ury-dashboard` track
- [x] Checkout / verify `feat/minimal-installation` branch in Frappe app repository (`/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury/`)
- [x] Scaffold React Dashboard app structure using Vite & React

### Core Layout & Global State
- [x] Implement global header with URY logo, search, notifications, user avatar, and Branch Selector dropdown
- [x] Implement global branch context (defaults to "All Branches")
- [x] Implement sticky left sidebar navigation (Dashboard, Menu, Table, Room, POS Profile, User, Branch, Advanced Settings accordion)
- [x] Connect router for all sub-routes under `/ury`

### Dashboard (Landing Page)
- [x] Implement 8 KPI Cards (Sales, Orders, Active Tables, Occupied Tables, Customers, AOV, Pending KDS, Active Cashiers)
- [x] Implement Analytics Cards (Sales Trend, Sales by Hour, Revenue by Branch, Payment Method, Order Type, Top Items)
- [x] Implement Report Widgets (Recent Sales, Popular Items, Popular Tables, Recent Activity, Low Performers)
- [x] Implement Quick Actions shortcut cards

### Modules & Drawers
- [x] Implement URY Menu module (card layout, quick actions, 4-section editing drawer, placeholder image fallback)
- [x] Implement URY Table module (grid view with rectangle/square/circle shapes, list view, layout editor launch button)
- [x] Implement URY Room module (room cards, printer config drawer)
- [x] Implement POS Profile module (tabbed interface for General, Operations, Printing, Cashiers, KOT, Advanced)
- [x] Implement User module (staff cards, role drawer)
- [x] Implement Branch module (branch cards, prefix/series drawer)
- [x] Implement Advanced Settings (URY Report Settings expandable cards & expense tables)

### Quality Assurance & Commit Strategy
- [x] Run `tsc --noEmit` build & type verification
- [x] Perform UI consistency check against URY POS design language
- [x] Perform code review following `quality-code-review` guidelines
- [x] Commit incremental changes to `feat/minimal-installation`

---

## Progress Log

| Date | Event |
|------|-------|
| 2026-08-06 | Track created, plan.md and tracker.md written, registered in index.md. Target branch: `feat/minimal-installation`, Route: `<url>/ury`. |
| 2026-08-06 | Executed parallel subagent workflow. All 4 subagents completed layout shell, landing dashboard, core modules, and config modules. Compiled production bundle with Vite. Verified typecheck. Committed incremental changes to branch `feat/minimal-installation`. |
