# URY Universal Documentation

This is the master index for the comprehensive URY application documentation. The documentation is organized into sections covering the Frappe backend, ERPNext integration, and the three Vue/React frontends (POS v2, KDS, Legacy POS).

**App Root**: `apps/ury/` (WSL: `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury`)
**Git Branch**: `develop`

---

## 1. Core Architecture & ERPNext Integration
*   [01. Architecture Overview](docs/01_architecture_overview.md) - System map, tech stack, environment, git info.
*   [02. ERPNext Integration](docs/02_erpnext_integration.md) - Custom fields, fixtures, ERPNext doctype overrides, aggregator integration.
*   [03. Doctypes](docs/03_doctypes.md) - Full specification of all 36 custom URY doctypes.
*   [04. Hooks & Events](docs/04_hooks_and_events.md) - `hooks.py`, `doc_events`, scheduler tasks, standard page overrides (JS).
*   [05. Backend APIs](docs/05_backend_apis.md) - All `@frappe.whitelist` methods, their parameters, and returns.
*   [06. Auth & Permissions](docs/06_auth_and_permissions.md) - URY User mapping, roles, POS Profile RBAC.

## 2. Business Logic & Flows
*   [07. POS Lifecycle](docs/07_pos_lifecycle.md) - Opening Entry -> Invoice -> KOT -> Closing Entry, and multi-cashier flows.
*   [08. KOT System](docs/08_kot_system.md) - Kitchen Order Ticket generation, validation, display, and reprinting.
*   [09. Printing System](docs/09_printing_system.md) - QZ Tray, network printing, and print logic.
*   [10. Real-time Sockets](docs/10_realtime_sockets.md) - Socket.io channels and event subscriptions.
*   [14. Order Types](docs/14_order_types.md) - Dine In, Take Away, Delivery, Phone In, and Aggregator order flows.
*   [15. Reporting & P&L](docs/15_reporting_and_pl.md) - P&L reports, cost of goods calculations, and report settings.

## 3. Frontend Applications
*   [11. React POS v2](docs/11_react_pos_v2.md) - Full React POS architecture, component tree, Zustand stores, and API facades.
*   [12. KDS Vue (URYMosaic)](docs/12_kds_vue_urymosaic.md) - KDS architecture, real-time socket flows, and API integrations.
*   [13. Legacy POS (urypos)](docs/13_legacy_pos_urypos.md) - Legacy POS architecture, Pinia stores, and legacy API flows.

## 4. Build, Deploy & Conventions
*   [16. Build & Deploy](docs/16_build_and_deploy.md) - Vite configs, build outputs, URL routing, and `www/` entry points.
*   [17. Standards & Conventions](docs/17_standards_and_conventions.md) - Naming conventions, coding patterns, and standards for future agents.

---

> **Note to AI Agents**: When tasked with planning or implementing features/fixes for URY, consult these section documents first. They contain the comprehensive system knowledge required to operate autonomously without excessive code reading.
