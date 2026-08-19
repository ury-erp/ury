# 08 — Content & Microcopy

Words are interface. Judged on three questions: does the label describe what will happen, does the error say what to do next, and does the sentence carry information the user didn't already have.

---

### C-01 — Doctype names leak into the manager's navigation
**Bad** · S2
**Evidence:** `frontend/src/components/layout/Sidebar.tsx:27-35`

**What's happening:**
```
Dashboard · URY Menu · URY Table · URY Room · POS Profile · User · Branch · Aggregators
```
Three items carry the `URY` prefix and three do not; the naming is Frappe's doctype list rendered directly as navigation.

**Why it matters:** the user is *inside* URY. Prefixing three of eight items with the product's own name adds no information and costs scan time on every visit — and the inconsistency (why is it "URY Table" but plain "User"?) makes the reader look for a distinction that doesn't exist. Singular nouns are also wrong for what are list pages: a manager clicking "URY Table" reasonably expects one table.

This is the most common way an internal data model surfaces as user-facing language, and it is the cheapest thing in this entire audit to fix.

**Better:**
```diff
- { label: 'URY Menu',  path: '/menu' },
- { label: 'URY Table', path: '/table' },
- { label: 'URY Room',  path: '/room' },
- { label: 'User',      path: '/user' },
+ { label: 'Menu',      path: '/menu' },
+ { label: 'Tables',    path: '/table' },
+ { label: 'Rooms',     path: '/room' },
+ { label: 'Staff',     path: '/user' },
```
"Staff" over "User" because that is what a restaurant owner calls them; "User" is a database concept.

**Targeted action:** rename the eight labels. Leave the routes alone.

**Regression check:** labels only — no route, no permission, no API surface changes. Grep for any test or e2e selector matching on the visible text (`getByText('URY Menu')`). If breadcrumbs or page titles derive from `NAV_ITEMS`, they update automatically, which is the desired outcome.

---

### C-02 — "Preview" navigates away
**Bad** · S2 · (full entry: [POS-04](03-pos-terminal.md))
**Evidence:** `pos/src/components/TableCard.tsx:144`

A label that promises a peek and delivers a navigation, while mutating POS store state on the way. Relabel to `Open` today; build the real preview later.

---

### C-03 — Errors describe the failure and omit the recovery
**Bad** · S2
**Evidence:** `pos/src/pages/Table.tsx:83` `'Failed to load rooms'`; `:152` `'Failed to load tables'`; `self-order/src/App.tsx:38` `'This device could not be started. Please contact staff.'`; `self-order/src/hooks/useOrderingSession.ts:77` `'This link is missing an ordering code. Please rescan the QR code on your table.'`

**What's happening:** every error names the operation that failed. Almost none offer a next step, and none render an action button beside the message.

**Why it matters:** "Failed to load tables" leaves a cashier with an empty screen and no move. It is also the *system's* framing of the event — the user doesn't care that a load failed, they care that they cannot see the floor. The kiosk's "please contact staff" is the sharpest case: on a wall-mounted device that is the only possible outcome, so the message should be aimed at the staff member who will eventually arrive, not the guest who cannot act.

The QR message is the best-written of the set — it says what's wrong *and* what to do — and shows the standard the others should meet.

**Better:**
| Now | Better |
|---|---|
| `Failed to load rooms` | `Couldn't load rooms. Check the connection and try again.` + a **Retry** button |
| `Failed to load tables` | `Couldn't load tables in {room}.` + **Retry** |
| `This device could not be started. Please contact staff.` | `This kiosk needs attention.` + small print: `Device {deviceId} · {errorCode} · show this to a staff member` |

**Targeted action:** pair every error string with a retry affordance; put the machine-readable identifier in the kiosk's staff-facing error. Contractions ("Couldn't") are warmer and shorter — use them.

**Regression check:** a Retry on the table view should call `loadTables(selectedRoom, { useCache: false })`, not the cached path, or it will "succeed" instantly by re-rendering the same failure. See [SO-07](02-self-ordering-kiosk.md) for the kiosk retry's constraint.

---

### C-04 — The progress subtitle repeats the heading, with a stray comma
**Bad** · S3 · (full entry: [SU-06](05-setup-wizard-onboarding.md))
**Evidence:** `frontend/src/components/setup/ProgressModal.tsx:80-82`

`Setting up your restaurant` / `Setting things up ,this usually takes less than a minute.`

---

### C-05 — "Start Over" and "New Order" are the same action with two names
**OK** · S3
**Evidence:** `self-order/src/layouts/MobileQRLayout.tsx:68` (`Start Over`), `PortraitKioskLayout.tsx:101` (`New Order`), `TabletLayout.tsx` and `LandscapeKioskLayout.tsx` (`New Order`)

**What's happening:** the same `resetSession` call is labelled two different ways across four layouts, with correspondingly different confirm copy ("Start over? Your current cart will be cleared." vs "Start a new order? Current cart will be cleared.").

**Why it matters:** low impact — a guest sees only one layout — but it is a maintenance and translation smell: four copies of near-identical strings will drift and will be translated four times. It also hints at unresolved intent. "Start Over" frames it as undoing a mistake; "New Order" frames it as beginning something. On a shared kiosk the second is right (the next customer); on a personal phone the first is (I mistyped).

**Better:** keep both, deliberately, with the divergence documented — mobile keeps `Start Over`, devices get `New Order` — and centralise the confirm dialog so the copy lives once. See [SO-05](02-self-ordering-kiosk.md).

---

### C-06 — "Active Tables" is a wrong label on a duplicated value
**Bad** · S2 · (full entry: [DA-02](04-manager-dashboard-reports.md))
**Evidence:** `frontend/src/pages/Dashboard/KPIGrid.tsx:59-63`

---

### C-07 — Report names are ambiguous and have no descriptions
**Bad** · S3 · (full entry: [DA-05](04-manager-dashboard-reports.md))
**Evidence:** `frontend/src/pages/Reports/reportsRegistry.ts` — `ReportEntry` has no `description` field.

`Daywise Sales`, `Daywise Invoices`, `Daywise Customer Details` sit adjacent in the sidebar and are not distinguishable from their titles. Seventeen one-line descriptions is a couple of hours of writing and is the highest clarity-per-effort item in this audit.

---

### C-08 — In-code comments are unusually good and should be treated as an asset
**Good** · S3
**Evidence:** `self-order/src/layouts/PortraitKioskLayout.tsx:11-25` (why the cart collapses); `self-order/src/hooks/useOrderingSession.ts:106-124` (why a QR reset lands in an error state and why that's correct, not a bug); `frontend/src/pages/Reports/ReportsLayout.tsx:3-11` (why this component must never render its own sidebar); `packages/ui/src/components/button.tsx:56-59` (why 44px, not 40px); `packages/ui/src/components/dialog.tsx:24-26` (why the overlay needed a keyframe rather than a transition).

**Why it matters:** these comments record *rejected alternatives and the reasoning behind decisions*, which is the part that is otherwise lost the moment the author moves on. They are the reason this audit could distinguish "considered trade-off" from "oversight" — a distinction that is usually impossible from source alone, and which changes the verdict on several items. The `ReportsLayout` comment in particular is a load-bearing warning that will prevent a future regression.

**Targeted action:** none, except: do not let a linter or a "clean up comments" pass delete them, and treat this as the house style worth spreading. Where an audit item here is deliberately *not* fixed, add a comment in the same voice saying so.
