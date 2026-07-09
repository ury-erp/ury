# URY Standards and Conventions

This document outlines the coding patterns and naming conventions used across the URY application.

## 1. Doctype Naming
- All custom URY Doctypes should be prefixed with `URY ` (e.g., `URY Order`, `URY KOT`).
- Custom fields injected into standard Doctypes should be prefixed with `custom_ury_` or `custom_`.

## 2. API Endpoints
- Custom endpoints are defined in `ury_pos/api.py` and `ury/api/`.
- Always use `@frappe.whitelist()` for endpoints accessed by the POS frontends.

## 3. Frontend State
- React POS uses Zustand for state management.
- Vue POS uses Pinia.

## 4. Real-time Events
- Socket channels should include the branch and optionally the production unit to isolate events (e.g., `kot_update_{branch}_{production}`).
