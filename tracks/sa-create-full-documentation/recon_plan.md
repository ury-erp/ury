---
owner: sa-user
git_user: swafaalikkal
status: active
---

# URY App Reconstruction & Reconnaissance Plan

This document outlines the multi-stage reconnaissance strategy to discover, analyze, and catalog all elements of the URY application located at `/mnt/c/Users/swafa/Projects/Bench/ury-bench/apps/ury`.

## Stage 1: Source Tree & Manifest Audit
- **Objective**: Establish the base directory structure and parse workspace configuration files.
- **Targets**:
  - Scan root files: `package.json`, `requirements.txt`, `setup.py`.
  - Identify package/module boundaries for both backend and frontend apps (`ury/`, `pos/`, `URYMosaic/`, `urypos/`).

## Stage 2: ERPNext & Database Schema Mapping (Fixtures & Doctypes)
- **Objective**: Catalog custom data structures and integrations with standard ERPNext modules.
- **Targets**:
  - Inspect `ury/ury/doctype/` directories. Catalog all custom Doctypes and compile their properties.
  - Parse `ury/fixtures/custom_field.json` to extract custom fields injected into standard ERPNext Doctypes (e.g., `POS Invoice`, `POS Profile`, `Branch`).
  - Catalog custom property setters, client scripts, and system roles defined in the fixtures folder.

## Stage 3: Hook, Event, & API Endpoint Mapping
- **Objective**: Map lifecycle events, scheduled tasks, and REST APIs.
- **Targets**:
  - Parse `ury/hooks.py` to identify:
    - Custom web route rules (`website_route_rules`).
    - Standard doctype overrides and event handlers (`doc_events`).
    - Fixture export lists.
    - Scheduler tasks.
  - Analyze `ury/ury_pos/api.py` for whitelisted Python methods used by the frontends.
  - Inspect files in `ury/ury/api/` to map modular api handlers (e.g. KOT display, validations).

## Stage 4: Frontend Framework & Layout Mapping
- **Objective**: Map POS and KDS UI architecture, routes, state management, and assets.
- **Targets**:
  - **POS React v2 (`pos/`)**: Inspect package configuration, router configurations, and main layouts.
  - **KDS Vue 3 (`URYMosaic/`)**: Document the Vue layout structure and API communication channels.
  - **Legacy POS Vue 3 (`urypos/`)**: Catalog entry points and status.
  - Verify static output mapping (Vite output config to `ury/public/`).

## Stage 5: Overrides & Real-time Integration Points
- **Objective**: Identify peripheral integrations and real-time interfaces.
- **Targets**:
  - Catalog client scripts injected into standard desktop flows (`ury/public/js/*`).
  - Document printing integrations (QZ Tray signatures in `sign-message.js`).
  - Map Socket.io communication channels used for live KOT updates.
