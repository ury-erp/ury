# Plan: URY Dashboard for Small Restaurant & Café Management System

**Track**: `ag-ury-dashboard`  
**Owner**: `antigravity`  
**Location**: `<url>/ury`  
**Branch**: `feat/minimal-installation`  
**Status**: Implemented / Refined (Updated 2026-08-12)  

---

## 1. Executive Summary & Objective

Build a lightweight, highly responsive, desktop-first **URY Dashboard** web application accessible at `<url>/ury` that serves as the primary post-onboarding administration interface for small restaurants and cafés.

The dashboard intentionally excludes ERP-level accounting, inventory, purchasing, manufacturing, or stock management complexities. It exposes only essential operational settings and tools required to efficiently run a restaurant or café.

### Design Principles & Visual Language
- **Visual Match**: Must strictly match the visual language of the existing **URY POS** application (white backgrounds, subtle shadows, blue URY accent color `hsl(var(--primary))` / `#2563eb`, rounded cards, clean outline icons, generous whitespace).
- **No ERPNext Desk Styling**: Do NOT use default ERPNext Desk templates or CSS styles.
- **Component & Core Reuse**: Built using **React** and standard **`@ury/core`** / **`@ury/ui`** utility & UI component libraries. **Always use ury/core ui, and do not edit core ui without user approval.**
- **Core Utilities**: Use core utils packages and add generic utilities into `ury/core`.
- **Data Fetching**: Direct frontend data fetching from Frappe API endpoints; no hardcoded frontend dummy data.
- **CRUD Operations**: Slide-over drawers for creation and inline editing across modules.
- **Form Schemas**: Load forms using JSON setup in `src/data/schemas/`.
- **Partition Headers**: In all module sections, use partition-style headers (`border-b border-gray-200`) instead of wrapped Card containers for titles and action buttons, strictly matching `/pos` styling.
- **Clean Forms & Placeholders**: Remove `e.g.` placeholder text and redundant field descriptions across all input fields.

---

## 2. Architecture & Application Structure

### Target Deployment Location & Route
- **URL Route**: `<url>/ury` (served by Frappe app route for `ury`)
- **Git Branch**: `feat/minimal-installation` (commit `4dc11d2` on `feat/redesign-dashboard`)

### High-Level Component Layout

```
+-----------------------------------------------------------------------------------+
| GLOBAL HEADER: Logo | Global Search | Notifications | User Profile | Branch Selector|
+-------------------+---------------------------------------------------------------+
| LEFT SIDEBAR      | MAIN CONTENT AREA                                             |
| (Sticky)          |                                                               |
| - Dashboard       | +-----------------------------------------------------------+ |
| - URY Menu        | | Partition Header: Search, Filters, View Mode, Actions     | |
| - URY Table       | +-----------------------------------------------------------+ |
| - URY Room        | |                                                           | |
| - POS Profile     | | Module View (KPI Cards, List/Grid Tables, Slide-over Drawer)| |
| - User            | |                                                           | |
| - Branch          | +-----------------------------------------------------------+ |
| v Advanced        |                                                               |
|   - Report Settings|                                                              |
+-------------------+---------------------------------------------------------------+
```

---

## 3. Detailed Specification by Component & Module

### 3.1. Global Header
- **Logo**: URY Brand Logo (top-left).
- **Notifications**: Notification bell with slide-over drawer.
- **User Profile**: Logged-in user avatar and menu.
- **Branch Selector** (Top-Right): Defaults to **"All Branches"**; filters all KPIs, tables, and settings globally via React Context.

### 3.2. Left Sidebar Navigation
- Sticky sidebar with navigation items: Dashboard, URY Menu, URY Table, URY Room, POS Profile, User, Branch, Advanced Settings (URY Report Settings).

---

### 3.3. Dashboard Module
- **Header Card**: Removed ("URY Executive Dashboard" title card removed for clean minimal top area).
- **Refresh Control**: Compact refresh button aligned to top-right.
- **KPI Cards Grid**: Clean stat cards displaying metric title and formatted value **without icons**.
- **Analytics & Charts Cards**: Visual sales trends, hourly peak breakdown, branch revenue, payment distribution, order types, and top-selling items.
- **Live POS Transactions**: Direct table view displaying live billing transactions (Invoice ID, Customer, Table, Order Type, Date/Time, Status, Grand Total). **Toggle for Recent Transactions / Audit Log removed** in favor of streamlined live transactions view.

---

### 3.4. URY Menu Module
- **Default View**: **List View** set as default layout.
- **Table Row Interactions**:
  - **Edit option** is always visible in the list view (no hover reveal / `opacity-0`).
  - Row hover background highlighting removed (`transition-colors` only).
- **Action Buttons & Header**:
  - Partition-style header (`border-b border-gray-200`) instead of card wrapper.
  - `+ Add Menu` button & drawer: create new `URY Menu` records with branch & price list assignment.
  - `+ Add Course` button & drawer: create new `URY Menu Course` records.
  - `+ Add Item` button & drawer.
- **Add/Edit Item Drawer**:
  - Target Menu select field.
  - Course selection: select from existing `URY Menu Course` entries OR switch to inline text input to create a new course directly.
  - Item Name and Standard Rate.

---

### 3.5. URY Table Module
- **Default View**: **List View** set as default layout.
- **Toolbar Layout**: **Edit Layout** button placed directly beside the `+ Add Table` button in the action group.
- **Form & Field Adjustments**:
  - Field label renamed to **"Table Name"** (formerly "Table Name / Number *").
  - Description text below Table Name removed.
  - All `e.g.` placeholder text removed from input fields.
  - **Branch** is a `<Select>` field populated directly from the `Branch` doctype.
  - **Room** is a `<Select>` field populated directly from `URY Room` docs.
- **Edit Layout View**: Embedded interactive floor plan layout editor for table positioning.

---

### 3.6. URY Room Module
- **Header**: Section title "Room Configuration" removed from header area for a clean partition toolbar containing only the `+ Add Room` action button.
- **Drawers**: Added **Branch** select field (fetched from `Branch` doctype) to both Add and Edit Room drawers.
- **Printer Configuration**: KOT printing toggle, print format, and takeaway block settings.

---

### 3.7. User Module
- **Header**: "Staff & User Management" section title removed.
- **List View Refinements**:
  - **Email** moved to display as a small subtitle directly below the username (no separate Email column).
  - Column header renamed to **"User ID"** in edit/add drawer.
  - **Status** column and Enabled checkbox removed from the table list view.
  - **Enabled (Active User)** toggle retained inside the edit/add drawer.

---

### 3.8. Branch Module
- **Data Integration**: Fetches settings and values directly from `Branch` and linked `URY Restaurant` doctypes.
- **Sections (Collapsible Partition Headers)**:
  1. **Branch Details**: Branch Name, Invoice Series Prefix, Aggregator Series Prefix, Tax ID, Address.
  2. **Menu Section**: Default Menu (Active Menu) select, Room-wise menu toggle, and `Menu for Room` child table mapping.
  3. **Room Section**: Default Room select from `URY Room` docs.
  4. **Order Type Menu Section**: Order Type Wise Menu toggle and `Order Type Menu` child table mapping.

---

### 3.9. POS Profile Module
- **Configuration Tabs**:
  1. **General Operations**: Price List (`selling_price_list`), Print Format (`print_format`), Item Discounts toggle, KOT Reprint toggle, Multi-cashier toggle.
  2. **Printer Mappings & QZ**: QZ Tray hardware printing & print format configuration.
  3. **Cashiers & Permissions**: **Cashier Table (Applicable for users)** display and mapping.
  4. **Production Unit Tab**: Dedicated tab fetching production unit records from `URY Production Unit` doctype.
- **Profile Edit Drawer**: Includes fields for Price List, Print Format, feature toggles, and Cashier Table permissions.

---

### 3.10. Advanced Settings - URY Report Settings
- Collapsible section in sidebar for business hours, aggregator settings, cost configuration, and direct/indirect fixed expense tables.

---

## 4. Implementation Status & Commit Log

- **Commit**: `4dc11d2` (`feat(dashboard): multi-module UI/UX refinements`)
- **Key Modified Files**:
  - `frontend/src/pages/Dashboard/DashboardPage.tsx`
  - `frontend/src/pages/Dashboard/KPIGrid.tsx`
  - `frontend/src/pages/Dashboard/ReportWidgets.tsx`
  - `frontend/src/pages/Dashboard/MenuPage.tsx`
  - `frontend/src/pages/Dashboard/TablePage.tsx`
  - `frontend/src/pages/Dashboard/RoomPage.tsx`
  - `frontend/src/pages/Dashboard/UserPage.tsx`
  - `frontend/src/pages/Dashboard/BranchPage.tsx`
  - `frontend/src/pages/Dashboard/PosProfilePage.tsx`
- **Build Status**:
  - `tsc --noEmit`: ✅ Exit code 0 (0 type errors)
  - `yarn build`: ✅ Exit code 0 (Vite build success, 1795 modules)

---

## 5. Verification Checklist

- [x] **Dashboard**: Header card removed, KPI card icons removed, transactions toggle removed.
- [x] **URY Menu**: Default list view, visible edit button, no hover on rows, Add Menu & Add Course buttons/drawers, inline course creation, partition header styling.
- [x] **URY Table**: Edit Layout next to Add Table button, default list view, Branch select from Branch doctype, Room select from URY Room, Table Name label updated, description & placeholders cleaned.
- [x] **URY Room**: Header title removed, Branch field added in drawers.
- [x] **User**: Header title removed, email subtitle below username, Status column removed, drawer label updated to User ID.
- [x] **Branch**: Values loaded from Branch and URY Restaurant doctypes; Menu, Room, and Order Type Menu partition sections added.
- [x] **POS Profile**: Price List, Print Format, Cashier Table (Applicable for users) added; Production Unit tab added.
- [x] **Build & Verification**: TypeScript clean and Vite production build verified.
