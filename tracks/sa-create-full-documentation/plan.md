---
owner: sa-user
git_user: swafaalikkal
status: complete
created: 2026-07-09
---

# Track: sa-create-full-documentation

## Goal
Create a comprehensive, multipage universal documentation set for the URY app covering all aspects: architecture, UI specifications, standards, features, backend/frontend, APIs, auth, ERPNext integration, and real-time systems. The goal is to produce documentation thorough enough for future agents to plan and implement features or fixes without requiring code reads.

## Output Location
- Primary doc: `c:\Users\swafa\Projects\Workspaces\ury\URY_UNIVERSAL_DOCS.md` (expand and restructure)
- Section docs: `c:\Users\swafa\Projects\Workspaces\ury\docs\` (individual topic files)
- Reference updated in: `c:\Users\swafa\Projects\Workspaces\ury\AGENTS.md`

## Dependency Graph & Todo

### Phase 0: Scaffold (no dependencies)
- [x] P0-1: Read and understand full directory structure of URY app
- [x] P0-2: Read hooks.py, setup.py in full
- [ ] P0-3: Create `docs/` folder structure in workspace

### Phase 1: Backend Core (depends on Phase 0)
- [ ] P1-1: Document all 36 custom Doctypes with fields, links, purpose (depends on P0-1)
- [ ] P1-2: Document hooks.py in full: doc_events, scheduler, page_js, app_include_js (depends on P0-2)
- [ ] P1-3: Document all whitelisted API endpoints in `ury/ury_pos/api.py` with params/returns (depends on P0-1)
- [ ] P1-4: Document all modular API handlers in `ury/ury/api/` (10 files) with purpose, inputs, outputs (depends on P0-1)
- [ ] P1-5: Document all doctype hooks in `ury/ury/hooks/` (6 files: pos_invoice, pos_profile, etc.) (depends on P0-1)
- [ ] P1-6: Document fixtures: all custom fields by doctype, roles, client_script.json, property_setter.json (depends on P0-1)

### Phase 2: ERPNext Integration (depends on Phase 1)
- [ ] P2-1: Document ERPNext doctype overrides and custom field injection strategy (depends on P1-6)
- [ ] P2-2: Document authentication and permission model: URY User mapping, role-based access, POS Profile roles (depends on P1-1, P1-3)
- [ ] P2-3: Document POS lifecycle: Opening Entry -> Invoice -> KOT -> Closing Entry flow (depends on P1-2, P1-5)
- [ ] P2-4: Document aggregator integration: Aggregator Settings doctype, fields, API flow (depends on P1-1, P1-3)
- [ ] P2-5: Document P&L and reporting: ury_daily_p_and_l, ury_cost_of_goods, ury_report_settings, reports (depends on P1-1)

### Phase 3: Real-time & Printing (depends on Phase 1)
- [ ] P3-1: Document KOT lifecycle: ury_kot_generate, ury_kot_validation, ury_kot_order_number (depends on P1-4)
- [ ] P3-2: Document printing architecture: QZ Tray, network printing, socket.io print channel (depends on P1-4)
- [ ] P3-3: Document Socket.io channels: print_{branch}, kot_update_{branch}_{production} (depends on P1-4)

### Phase 4: Frontend - React POS v2 (depends on Phase 1)
- [ ] P4-1: Document React POS v2 full component tree with file refs and line numbers (depends on P0-1)
- [ ] P4-2: Document all Zustand stores (pos-store, slices) with state shape and actions (depends on P0-1)
- [ ] P4-3: Document all API facades in `pos/src/lib/` (17 files) with signatures and backend touchpoints (depends on P1-3, P1-4)
- [ ] P4-4: Document UI flows: POS checkout, table selection, payment dialog, product variants/addons (depends on P4-1)
- [ ] P4-5: Document auth flow in React POS: AuthGuard, POSOpeningProvider, session/local storage caching (depends on P4-2)
- [ ] P4-6: Document React POS build process: Vite config, copy-html-entry script, output paths (depends on P0-1)

### Phase 5: Frontend - KDS Vue 3 (URYMosaic) (depends on Phase 1)
- [ ] P5-1: Document URYMosaic component tree: App.vue, Header.vue, kot.vue with file refs (depends on P0-1)
- [ ] P5-2: Document KDS real-time flow: socket.io subscription, channel naming, ticket state machine (depends on P3-3)
- [ ] P5-3: Document KDS API calls and auth (depends on P1-3)
- [ ] P5-4: Document URYMosaic build: Vite config, output path (depends on P0-1)

### Phase 6: Frontend - Legacy POS Vue 3 (urypos) (depends on Phase 1)
- [ ] P6-1: Document urypos component tree: App.vue, views, bottom tabs with file refs (depends on P0-1)
- [ ] P6-2: Document all Pinia stores (13 files): Auth, Menu, Table, Customer, invoiceData, recentOrder, etc. (depends on P0-1)
- [ ] P6-3: Document urypos API calls and backend touchpoints (depends on P1-3)
- [ ] P6-4: Document urypos build: Vite config, copy-html-entry script (depends on P0-1)

### Phase 7: Cross-cutting Concerns (depends on Phase 1-6)
- [ ] P7-1: Document frontend-to-backend URL routing: website_route_rules, www/ html files (depends on P1-2, P4-6, P5-4, P6-4)
- [ ] P7-2: Document full order type system: Dine In / Take Away / Delivery / Phone In / Aggregators flows (depends on P2-3, P4-4)
- [ ] P7-3: Document multi-cashier configuration and sub-POS closing flow (depends on P2-3, P1-1)
- [ ] P7-4: Document ERPNext standard page overrides: pos_extend.js, quick_entry.js, restrict_qty_edit_pos.js (depends on P1-2)

### Phase 8: Compilation & Finalization (depends on Phase 1-7)
- [ ] P8-1: Restructure URY_UNIVERSAL_DOCS.md as index/overview linking to all section docs (depends on all Phase 1-7)
- [ ] P8-2: Create individual section docs in `docs/` folder (depends on P8-1)
- [ ] P8-3: Add git branch info, file paths with line numbers throughout all docs (depends on P8-2)
- [ ] P8-4: Update AGENTS.md with final reference and doc structure (depends on P8-1)
- [ ] P8-5: Update plan.md status to complete (depends on P8-4)

## Planned Doc Structure

```
URY_UNIVERSAL_DOCS.md          # Master index/overview
docs/
  01_architecture_overview.md  # System map, tech stack, env, git info
  02_erpnext_integration.md    # Custom fields, fixtures, ERPNext doctype overrides
  03_doctypes.md               # All 36 custom doctypes with full field specs
  04_hooks_and_events.md       # hooks.py, doc_events, scheduler, page_js
  05_backend_apis.md           # All @frappe.whitelist methods with params/returns
  06_auth_and_permissions.md   # URY User, roles, POS Profile RBAC
  07_pos_lifecycle.md          # POS Open -> Invoice -> KOT -> Close flow
  08_kot_system.md             # KOT generation, validation, display, reprinting
  09_printing_system.md        # QZ Tray, network printing, socket print channel
  10_realtime_sockets.md       # All socket.io channels and events
  11_react_pos_v2.md           # Full React POS architecture, components, stores, APIs
  12_kds_vue_urymosaic.md      # KDS architecture, real-time, API
  13_legacy_pos_urypos.md      # Legacy POS architecture, Pinia stores, API
  14_order_types.md            # Dine In / Take Away / Delivery / Aggregators flows
  15_reporting_and_pl.md       # P&L reports, cost of goods, report settings
  16_build_and_deploy.md       # Vite configs, build outputs, www/ entry points
  17_standards_and_conventions.md # Naming, coding patterns, standards
```

## Code Location Reference
- **App Root (Win)**: `c:\Users\swafa\Projects\Bench\ury-bench\apps\ury`
- **App Root (WSL)**: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury`
- **Git Branch**: `develop` (primary active branch)
- **Backend**: `ury/ury/` (Python/Frappe)
- **POS React v2**: `pos/src/`
- **KDS Vue 3**: `URYMosaic/src/`
- **Legacy POS Vue 3**: `urypos/src/`
- **Public JS Overrides**: `ury/public/js/`
- **Fixtures**: `ury/fixtures/`
- **Hooks**: `ury/hooks.py`

## Execution Strategy
Tasks in the same phase can be executed in parallel by multiple agents. Tasks in Phase N+1 depend on Phase N being complete. Each agent writes its output to the corresponding file in `docs/`. The coordinator (this agent) assembles the final index.

## Notes
- Use `wsl` commands or Windows paths (`c:\Users\swafa\Projects\Bench\...`) for file reads.
- Include file paths and line numbers for all code references.
- All output docs must be written from the perspective of "what does an agent need to know to plan a feature or fix without reading code."
- No emojis. Stoic, direct tone.
