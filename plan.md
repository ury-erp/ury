# URY Setup Wizard Implementation Plan

This document maps out the detailed execution plan for building the custom, JSON-driven Setup Wizard onboarding flow for the URY application, replacing the default ERPNext/Frappe setup wizard.

---

## Phase 1: Routing and Login Interception
- **Interception Hook**: Implement a `before_request` hook `redirect_to_setup` in the backend python controllers.
- **Hook Registration**: Register the hook in `hooks.py` under the `before_request` hook. If the site is not setup (`setup_complete: 0`) and the user has logged in (not Guest) and tries to access `/app` or `/setup-wizard`, they are redirected to `/ury` at the HTTP routing level.
- **Frontend App Router**: Configure page-level routing using `react-router-dom` under `/ury` to display the wizard layout when the user lands on `/`.

## Phase 2: Schema Configuration & JSON Files
- **Schema Paths**: Under `frontend/src/data/`:
  - `forms/setup.json`: Configures sections (General, Company), field ordering, field types (select, text, date), placeholders, default static values, and validator triggers (omitting Administrator credentials fields since the admin user is pre-created during install).
  - `validations.json`: Defines regex configurations and localized error messages for fields validation (minLength, pattern, required).

## Phase 3: Service Layer & Backend APIs
- **Setup Defaults Endpoint**: Create a whitelisted API `ury.ury.api.setup.get_setup_defaults` returning standard languages, GeoIP country, standard list of countries, currencies, and timezones from pytz.
- **Country Selection Defaults Endpoint**: Create a whitelisted API `ury.ury.api.setup.get_country_defaults(country)` to fetch and return country default currency and timezone mapping automatically.
- **Chart of Accounts Endpoint**: Integrate `erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts.get_charts_for_country` dynamically inside the frontend when the selected country changes.
- **Services Layer Class**: Implement `setup.ts` to manage API calls via `@ury/core`'s `call` utility for fetching options, country defaults, and posting the final setup complete payload.

## Phase 4: Dynamic Form Engine & Validation
- **FieldRenderer.tsx**: Renders inputs, dates, and selects dynamically.
- **FormSection.tsx**: Groups fields inside a clean grid layout inside card containers (General and Company sections).
- **DynamicForm.tsx**: Binds sections, fields, values, errors, and select options together.
- **Validation Utility**: Extends `@ury/core` utility package with a generic `validateFieldValue` helper for reuse across applications.

## Phase 5: Setup Wizard Page Layout & UI
- **WizardLayout.tsx**: Provides a premium header with URY logo and layout container.
- **SetupPage.tsx**: Controls state, manages dynamic fetches (Chart of Accounts on country change), auto company abbreviations, selector cards for "Minimal" vs "Advanced" installation types, validation execution, payload building (calculating `fy_end_date`), and submission redirects.
- **NextStepPage.tsx**: Serves as a success step page for minimal installation redirects.

## Phase 6: Build Integration & Verification
- Compile all packages and frontend bundles cleanly via `yarn build` inside WSL context.
- Verify production assets copy output mapping to `ury/www/ury.html`.
- E2E check on `ury.local` database for setup verification (authentrating as `Administrator` with password `swafa@ury`).
