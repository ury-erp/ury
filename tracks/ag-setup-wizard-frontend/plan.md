# Detailed Phase-by-Phase Execution Plan: URY Setup Wizard

This document outlines the detailed execution plan to replace the default ERPNext/Frappe setup wizard with a custom, JSON-driven onboarding flow in the URY application.

---

## Phase 1: Routing and Login Interception

**Goal:** Intercept the login redirect to `/setup-wizard` and redirect user to the `/ury` setup route. Ensure `/ury` serves the new single-page setup app when setup is not complete.

### Backend Routing Interception
1. Update `bootinfo.home_page` via a hook. In `ury/hooks.py`, we can intercept requests. Wait, since Frappe checks `setup_complete` and redirects, we can override the `boot_session` hook or simply add a route rewrite rule in `website_route_rules` in `hooks.py`.
2. Map `{"from_route": "/setup-wizard", "to_route": "ury"}` or use a custom python redirect in `www/ury.py` so that if `setup_complete` is `0`, accessing `/ury` is permitted and renders the wizard, and any attempt to load the main app `/app` redirects to `/ury`.
3. In `ury/hooks.py`, verify `website_route_rules`. Add `{"from_route": "/setup-wizard", "to_route": "ury"}` so the Desk setup-wizard path maps to our `/ury` SPA page.

### Frontend App Routing
1. Update `frontend/src/App.tsx` to handle page-level routing.
2. If setup is incomplete, the default view must be `<SetupPage />`.
3. Configure `basename="/ury"` for React Router inside `frontend/src/main.tsx` (already exists).

---

## Phase 2: Schema Configuration & JSON Files

**Goal:** Define the JSON files that configure form fields, validation rules, default static lists (currencies, timezones, languages) to fulfill Rule 1.

### Schema Location
Create these files under `frontend/src/data/`:
- `forms/setup.json`: Defines sections (`General`, `Company`), field type (`select`, `text`, `date`), constraints, options (if static), and fields mapping (removing Administrator credentials since the admin user is pre-created during install).
- `validations.json`: Defines regex patterns and default error messages for validators like `minLength`, `maxLength`, `required`, and `pattern`.
- `timezones.json` (as a fallback/static cache for offline mode).
- `languages.json` (as a fallback).
- `currencies.json` (as a fallback).

---

## Phase 3: Service Layer & Backend APIs

**Goal:** Fetch dynamic values from Frappe and ERPNext setup APIs and submit the completion payload.

### Backend API (`ury/ury/api/setup.py`)
1. Create a whitelisted API `ury.ury.api.setup.get_setup_defaults` that aggregates:
   - Available languages from `frappe.desk.page.setup_wizard.setup_wizard.load_languages()`.
   - Guest/GeoIP country from `frappe.desk.page.setup_wizard.setup_wizard.load_country()`.
   - List of all countries.
   - List of all currencies.
   - List of timezones from `pytz.all_timezones`.
2. Create a whitelisted API `ury.ury.api.setup.get_country_defaults(country)` that returns `{ "currency": info.get("currency"), "timezone": info.get("timezones")[0] }` using `frappe.geo.country_info.get_country_info(country)`.
3. Leverage `erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts.get_charts_for_country` to fetch charts of accounts dynamically in the frontend whenever the user changes the selected Country.

### Frontend Service Layer (`frontend/src/services/setup.ts`)
1. Implement client calls using `@ury/core`'s `call` helper.
2. Expose `getSetupDefaults()`.
3. Expose `getCountryDefaults(country)`.
4. Expose `getChartsForCountry(country)`.
5. Expose `submitSetup(payload)`:
   - Maps payload to matching Frappe/ERPNext setup fields (including computing `fy_end_date` as `fy_start_date` + 12 months - 1 day, without sending any admin user creation fields).
   - Calls `frappe.desk.page.setup_wizard.setup_wizard.setup_complete` with the arguments.

---

## Phase 4: Dynamic Form Engine & Validation

**Goal:** Create a robust React form engine that generates forms dynamically from the JSON schema and validates inputs without hardcoding.

### Components
1. `FieldRenderer.tsx`:
   - Renders appropriate `@ury/ui` components based on field type (`Input`, `Select`, etc.).
   - Standardizes value propagation and focus.
2. `DynamicForm.tsx`:
   - Manage local state of all form fields.
   - Run validation engine against `validations.json` rules.
   - Track touched fields and display real-time validation errors.

---

## Phase 5: Setup Wizard Page Layout & UI

**Goal:** Implement the Single-page UI layout conforming to URY Core's design language.

### Components
1. `WizardLayout.tsx`:
   - Header with Logo and page title.
   - Main container with layout grid.
2. `SetupPage.tsx`:
   - Renders installation type selector cards (Minimal vs Advanced).
   - Displays the `DynamicForm`.
   - Listens to country changes to auto-fetch and set default timezone, currency, and chart of accounts template.
   - Renders a "Complete Setup" action button with loading spinner indicator.
   - Handles redirects after successful submission:
     - **Minimal:** Redirect to next onboarding page `/ury/next-step` or equivalent.
     - **Advanced:** Redirect to `/app`.

### UI Mockup Design
The custom setup wizard interface matches the URY POS styling using `@ury/ui` components:

---

## Phase 6: Build Integration & E2E Validation

**Goal:** Ensure the build compiles successfully and the wizard works end-to-end on `ury.local`.

1. Compile frontend workspace: `yarn build` from `apps/ury/frontend/` or the root workspace via WSL.
2. Verify production bundle output to `ury/www/ury.html` and assets.
3. Test end-to-end flow:
    - Authenticate as Administrator on `ury.local` using the password `swafa@ury`.
    - Access `/ury` (or get redirected to `/ury` from login).
    - Complete setup and confirm creation of Company, Fiscal Year, and default user settings on the backend.
