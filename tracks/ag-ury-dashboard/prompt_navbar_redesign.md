# URY Dashboard Navbar Redesign — Detailed Implementation Prompt

You are working on the **URY POS / ERPNext / Frappe application**. Your task is to redesign and refactor the **Dashboard top navigation/header** so that it matches the URY POS visual language and the provided POS screenshot, while removing all frontend dummy/static data from the relevant header controls and replacing it with real Frappe/ERPNext data.

This is an implementation task, not a mockup. Inspect the existing codebase first, identify the actual components/files currently responsible for the Dashboard navbar, and modify the existing architecture rather than creating parallel/duplicate implementations.

---

## 1. Project / Architecture Context

The project is a custom **Frappe + ERPNext + React/Vite** application.

Relevant project structure (as outlined in `tracks/ag-ury-dashboard/plan.md`):

```text
apps/ury/
├── ury/
│   ├── ury/
│   │   └── api/
│   │       └── dashboard.py
│   └── ...
│
└── frontend/
    └── src/
        ├── components/
        │   └── layout/
        │       ├── Sidebar.tsx
        │       └── Header.tsx
        │
        ├── pages/
        │   └── Dashboard/
        │       ├── DashboardPage.tsx
        │       ├── MenuPage.tsx
        │       ├── TablePage.tsx
        │       ├── UserPage.tsx
        │       ├── BranchPage.tsx
        │       └── PosProfilePage.tsx
        │
        └── ...
```

The architecture and plan confirm the following strict rules:

* Frontend is **Vite + React 19 + TypeScript**.
* **Component Library**: You must use **React** and the standard **`@ury/core`** / **`@ury/ui`** utility & UI component libraries. Always use `ury/core` UI components, and do not edit core UI without explicitly communicating it.
* Styling uses **Vanilla CSS + Tailwind-style variables/tokens**.
* **Visual Match**: Must strictly match the visual language of the existing **URY POS** application (`/pos`). This means: white backgrounds, subtle shadows, blue URY accent colors (`hsl(var(--primary))` / `#2563eb`), rounded cards, clean outline icons, and generous whitespace.
* **No ERPNext Desk Styling**: Do NOT use default ERPNext Desk templates or CSS styles.
* **Partition Headers**: Use partition-style headers (`border-b border-gray-200`) instead of wrapped Card containers for titles and action buttons.
* Dashboard layout components to target are primarily under: `frontend/src/components/layout/Header.tsx` and `frontend/src/pages/Dashboard/DashboardPage.tsx`.

---

## 2. Reference Screenshots

There are two supplied visual references.

### Dashboard screenshot

The current Dashboard contains:

* URY POS branding at the top-left.
* Dashboard Shell text.
* Large search bar in the top navigation.
* Branch selector near the top-right.
* Notification bell.
* User/avatar menu.
* Existing Dashboard-specific styling.

The current Dashboard header is the area that needs to be redesigned.

### POS screenshot

The second screenshot shows the desired direction for the user/account control.

The POS user menu contains:

```text
URY Cashier
urycashier@gmail.com

----------------------------

Switch To Desk
Clear Cache
Logout
```

The Dashboard should adopt this **same visual/design language** (white backgrounds, subtle shadows, `#2563eb` accents, clean outline icons), adapted appropriately for the Dashboard's administrator/manager context.

Do not blindly copy POS-specific actions that don't make sense on the Dashboard. The goal is to reproduce the **design, spacing, typography, dropdown structure, avatar treatment, colors, separators, and interaction style**.

---

## 3. Primary Objective

Redesign the Dashboard navbar/header to look and behave like a polished URY-branded application.

The resulting navbar should:

1. Use URY branding/colors (`hsl(var(--primary))` / `#2563eb`).
2. Use the provided URY logo image.
3. Remove the existing logo/text implementation.
4. Remove the global Dashboard search bar.
5. Redesign the user/account dropdown to match the POS user dropdown.
6. Redesign the Branch selector with URY colors and accents.
7. Remove all branch dummy/static frontend data.
8. Fetch actual Branch records from the Frappe `Branch` DocType.
9. Redesign the notification button/dropdown with URY colors.
10. Remove notification dummy/static data.
11. Connect notifications to real backend/Frappe data.
12. Preserve permissions and user-specific behavior.
13. Avoid breaking the existing Dashboard routing/layout (`frontend/src/pages/Dashboard/*`).
14. Keep the implementation reusable and maintainable using `@ury/ui`.

---

## 4. IMPORTANT — Inspect Before Editing

Before changing code, inspect the repository thoroughly.

Find:

### Dashboard navbar/header

Target `frontend/src/components/layout/Header.tsx` and search for:

```text
Header
Navbar
Dashboard Shell
All Branches
notification
bell
search
avatar
User Profile
Report Settings
Log Out
branch
```

Identify:

* The actual Dashboard header component (`Header.tsx`).
* Any wrapper/layout component around it (`DashboardPage.tsx`).
* The existing branch selector component.
* The existing notification component/dropdown.
* The existing user/account dropdown.
* Any shared components reused by the POS frontend (check `@ury/ui`).
* Existing API/service utilities for Frappe calls (check for direct frontend data fetching from Frappe API endpoints).
* Existing authentication/session/user hooks.

**Do not duplicate functionality if an equivalent POS component already exists in `@ury/ui` or `@ury/core`.**

---

## 5. Branding / Logo Change

### Remove existing logo and text

The current Dashboard navbar has an existing logo/icon plus text similar to:

```text
URY POS
Dashboard Shell
```

Remove the existing logo implementation and the associated branding text if it is part of the navbar/header branding.

Replace it with the actual URY image:

```text
/assets/ury/Images/URY-bg.png
```

Use this exact asset path. Do not recreate the logo using SVG, CSS, Lucide icons, text, or another placeholder image.

---

## 6. Remove Dashboard Search Bar

The Dashboard navbar currently contains a large search field. Remove it entirely from the Dashboard navbar.

This means:

* Remove the visible search input.
* Remove its search icon.
* Remove placeholder text.
* Remove associated dummy behavior if it exists.
* Remove unused search state/hooks/imports.
* Remove CSS that only exists for this header search control.

Do not replace it with another search field.

---

## 7. URY Color System

Use the established URY visual identity.

```text
Primary URY Blue: hsl(var(--primary)) / hsl(221.2, 83.2%, 53.3%) / #2563eb
```

Use the project's existing color variables/tokens if they already exist rather than hardcoding colors everywhere.

First search for existing variables such as:

```text
--primary
--primary-color
```

and reuse them. Do not redesign the entire Dashboard. The task is specifically the navbar/header and its related dropdowns.

---

## 8. User Account Menu

### Goal

Change the Dashboard user menu to visually match the user dropdown shown in the supplied POS screenshot. The POS reference has a specific layout that you must adhere to. The Dashboard currently has an administrator-style menu. Redesign this control.

### 8.1 User trigger

The top-right user trigger should include:

* User/avatar representation.
* Current user's display name.
* Dropdown indicator if appropriate.
* URY styling (`hsl(var(--primary))` hover/focus states).
* Correct hover/focus states.
* No unnecessary visual noise.

Retrieve the current authenticated user using the application's existing Frappe authentication/session mechanism. Do not hardcode any static identity.

### 8.2 User dropdown

Match the POS visual language:

* Rounded dropdown.
* White/light background consistent with application theme.
* Subtle border.
* Subtle shadow.
* Clean separators (`border-b border-gray-200`).
* Compact menu items.
* Blue/URY accents (`hsl(var(--primary))`) on hover/active states.
* Red only for logout/destructive action.
* Proper alignment.
* Consistent outline icon sizing.

Determine which actions are appropriate for Dashboard (e.g. User Profile, Report Settings, Log Out) and visually restyle them to match the POS dropdown.

---

## 9. Branch Selector

The Dashboard currently has a branch selector (e.g., "All Branches"). This needs both a visual and data-layer redesign.

### 9.1 Visual requirements

Change the Branch selector to match the URY branding.

Requirements:

* URY blue accents (`hsl(var(--primary))`).
* Clean rounded control.
* Proper hover state.
* Selected state using light blue/URY styling.
* Dropdown matching the user menu visual language (white background, subtle shadow, clean dividers).
* No generic/default browser dropdown.

---

## 10. Remove Branch Dummy Data

This is critical. Search `frontend/src/components/layout/Header.tsx` (and related files) for hardcoded branch values (e.g., "Main Branch", "Downtown"). 

Remove any hardcoded branch lists. The frontend must not pretend these are real records.

---

## 11. Fetch Real Branch Data

The branch selector must use the actual Frappe `Branch` DocType. Use direct frontend data fetching from Frappe API endpoints.

Prefer the project's established pattern (e.g., `frappe.client.get_list` or equivalent hooks).

### 11.1 Permissions

Respect Frappe permissions. Do not use `ignore_permissions=True` for normal frontend branch retrieval. 

### 11.2 Loading & Empty States

The selector must have a proper loading state (e.g., "Loading branches..." or a skeleton). Do not render fake branch names while loading. Show "No branches available" if no branches are found.

### 11.3 Error state

If the Branch API fails, do not crash the Dashboard. Show a small appropriate error state. Log the technical error appropriately for debugging. Do not expose raw backend stack traces to users.

---

## 12. "All Branches" Behavior

If the current Dashboard supports an aggregate branch mode, preserve it. "All Branches" can be a UI-level selection representing no branch filter. However, do not confuse it with a real Branch record. 

If the Dashboard analytics/data API supports branch filtering (globally via React Context), ensure the selected branch is actually passed to the relevant Dashboard data requests.

---

## 13. Notifications

The notification control also needs a full visual/data cleanup. Redesign it using URY colors (`hsl(var(--primary))`) and the same visual quality as the user/branch controls (white backgrounds, outline icons, subtle shadows).

---

## 14. Remove Notification Dummy Data

Search the codebase for hardcoded notification examples (e.g., "New Order", "Payment received"). Remove these from the production UI.

---

## 15. Connect Notifications to Real Frappe Data

Identify what notification source the application is intended to use (e.g., `Notification Log`, `frappe.realtime`). Use the application's existing notification architecture where possible. Do **not** invent a completely separate notification database model.

Map the actual Frappe response into a small frontend notification model and ensure read/unread states are accurate based on backend data.

---

## 16. Icons & Emojis

The request specifically calls for: "remove icons and frontend dummy data in branch selection". 

For the **branch list itself**, remove decorative/fake icons. Branch records should primarily display their real branch name/data. 

Do not use emojis anywhere. This follows the existing URY development guideline that the UI should use concise terminology and avoid emojis. Clean outline icons from `@ury/ui` (or equivalent) are acceptable for top-level navbar controls.

---

## 17. Code Quality & Responsive Design

Use:

* TypeScript types.
* Existing project conventions (Partition-style headers instead of wrapped Card containers).
* Small reusable components from `@ury/ui`.
* Existing hooks/utilities from `@ury/core`.
* Proper cleanup of event listeners/effects.

The navbar must be responsive (Desktop, Laptop, Tablet) while preserving the existing application shell structure (`frontend/src/components/layout/Sidebar.tsx` and `Header.tsx`).

---

## 18. Testing Checklist

After implementation, test all of the following:

### Header
* [ ] Dashboard loads without errors.
* [ ] URY logo is displayed from `/assets/ury/Images/URY-bg.png`.
* [ ] Search bar is completely removed.
* [ ] Navbar uses URY colors (`hsl(var(--primary))` / `#2563eb`).

### User
* [ ] Actual logged-in user name is displayed.
* [ ] User dropdown matches POS styling (white bg, subtle shadow, partition lines).
* [ ] Logout and profile actions still work.

### Branches
* [ ] Branch list comes from `Branch` DocType.
* [ ] No hardcoded branch records or fake branch icons remain.
* [ ] User permissions are respected (no `ignore_permissions=True`).
* [ ] Branch selection filters data globally via React Context (if supported).

### Notifications
* [ ] No dummy notification records remain.
* [ ] Real Frappe notification data (`Notification Log`) is displayed.
* [ ] Unread state is accurate.

### Code
* [ ] TypeScript has no new errors (`tsc --noEmit` passes).
* [ ] No React effect/listener leaks.

---

## 19. Final Deliverable

After making the changes, provide a concise implementation report containing:

1. **Files changed** (e.g., `frontend/src/components/layout/Header.tsx`, `DashboardPage.tsx`)
2. **Files created/removed**, if any
3. **POS user component identified/reused** (from `@ury/ui`)
4. **Branch & Notification data source used**
5. **API/backend changes**
6. **Styling/token changes**
7. **Dummy data removed**
8. **Testing performed**

The implementation should be production-quality and strictly follow the existing URY/Frappe architecture (`@ury/core`, `@ury/ui`, `/pos` visual rules) rather than introducing an unrelated frontend pattern.
