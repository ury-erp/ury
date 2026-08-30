import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { call } from '@ury/core';
import SetupPage from './pages/Setup/SetupPage';
import ConfigurePage from './pages/Setup/ConfigurePage';
import DashboardLayout from './components/layout/DashboardLayout';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { MenuPage } from './pages/Dashboard/MenuPage';
import { TablePage } from './pages/Dashboard/TablePage';
import { RoomPage } from './pages/Dashboard/RoomPage';
import { PosProfilePage } from './pages/Dashboard/PosProfilePage';
import { UserPage } from './pages/Dashboard/UserPage';
import { BranchPage } from './pages/Dashboard/BranchPage';
import { ReportSettingsPage } from './pages/Dashboard/ReportSettingsPage';
import { SelfOrderingProfilePage } from './pages/Dashboard/SelfOrderingProfilePage';
import ProductionUnitPage from './pages/Dashboard/ProductionUnitPage';
import ProductionDepartmentPage from './pages/Dashboard/ProductionDepartmentPage';
import ItemProductionConfigPage from './pages/Dashboard/ItemProductionConfigPage';
import AggregatorPage from './pages/Dashboard/AggregatorPage';
import SalesPlanPage from './pages/Dashboard/SalesPlanPage';
import RequirementsPage from './pages/Dashboard/RequirementsPage';
import MenuRoutingPage from './pages/Dashboard/MenuRoutingPage';
import { ServicePage } from './pages/Dashboard/ServicePage';
import { DepartmentStockPage } from './pages/Dashboard/DepartmentStockPage';
import { StoreIssuePage } from './pages/Dashboard/StoreIssuePage';
import { WastagePage } from './pages/Dashboard/WastagePage';
import { DepartmentProfitabilityPage } from './pages/Dashboard/DepartmentProfitabilityPage';
import { DayClosePage } from './pages/Dashboard/DayClosePage';
import { KotErrorLogPage } from './pages/Dashboard/KotErrorLogPage';
import { StockReservationPage } from './pages/Dashboard/StockReservationPage';
import { PaymentTerminalPage } from './pages/Dashboard/PaymentTerminalPage';
import { RoleGuard } from './components/RoleGuard';
import { AuthGuard } from './components/AuthGuard';
import { Landing } from './components/Landing';
import { ReportsLayout } from './pages/Reports/ReportsLayout';
import { ReportsHome } from './pages/Reports/ReportsHome';
import { TodaysSales } from './pages/Reports/TodaysSales';
import { DaywiseSales } from './pages/Reports/DaywiseSales';
import { DaywiseInvoices } from './pages/Reports/DaywiseInvoices';
import { MonthWiseSales } from './pages/Reports/MonthWiseSales';
import { TimeWiseSales } from './pages/Reports/TimeWiseSales';
import { ServiceWiseSales } from './pages/Reports/ServiceWiseSales';
import { CancelledInvoices } from './pages/Reports/CancelledInvoices';
import { AverageBillValue } from './pages/Reports/AverageBillValue';
import { ItemWiseSales } from './pages/Reports/ItemWiseSales';
import { ItemWisePurchaseHistory } from './pages/Reports/ItemWisePurchaseHistory';
import { CustomerData } from './pages/Reports/CustomerData';
import { DaywiseCustomerDetails } from './pages/Reports/DaywiseCustomerDetails';
import { RepeatedCustomers } from './pages/Reports/RepeatedCustomers';
import { EmployeeSales } from './pages/Reports/EmployeeSales';
import { EmployeeItemWiseSales } from './pages/Reports/EmployeeItemWiseSales';
import { CompletedWorkOrders } from './pages/Reports/CompletedWorkOrders';
import { DailyPnl } from './pages/Reports/DailyPnl';

// `/ury/pos/*` — pos/ route tree merged in per PLAN.md
// tracks/sa-app-consolidation §7 Phase 1. Lazy-loaded per route (not just
// per subtree) so admin-report chunks (recharts, @json-render/*, the 18
// report pages) never ship to cashier/waiter hardware on first load, and
// vice versa (§6's bundle-size risk) — `frontend/`'s existing routes above
// are NOT retrofitted to lazy-loading, only these new ones.
const PosLayout = lazy(() => import('./pages/Pos/PosLayout'));
const PosDashboard = lazy(() => import('./pages/Pos/pages/Dashboard'));
const PosPOS = lazy(() => import('./pages/Pos/pages/POS'));
const PosTable = lazy(() => import('./pages/Pos/pages/Table'));
const PosOrders = lazy(() => import('./pages/Pos/pages/Orders'));
const PosSettings = lazy(() => import('./pages/Pos/pages/Settings'));
const PosOpenEntries = lazy(() => import('./pages/Pos/pages/OpenEntries'));
const CaptainRouteGuard = lazy(() => import('./pages/Pos/captain/components/CaptainRouteGuard'));
const CaptainTables = lazy(() => import('./pages/Pos/captain/pages/CaptainTables'));
const CaptainOrder = lazy(() => import('./pages/Pos/captain/pages/CaptainOrder'));

function PosRouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

interface WizardStatus {
  step1_complete: boolean;
  step2_complete: boolean;
}

function SetupGuard() {
  const [status, setStatus] = useState<WizardStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await call<any>(
          'ury.ury.api.minimal.setup_organization.get_wizard_status'
        );
        const wizardStatus: WizardStatus = res?.message ?? res;

        if (!cancelled) {
          setStatus(wizardStatus);
        }
      } catch {
        // If the status fetch fails, fall back to treating setup as incomplete
        // rather than flashing a redirect to the dashboard on bad data.
        if (!cancelled) {
          setStatus({
            step1_complete: false,
            step2_complete: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  const isSetupRoute = window.location.pathname.startsWith(
    '/ury/setup-wizard/'
  );

  if (!status.step2_complete && !isSetupRoute) {
    return (
      <Navigate
        to={status.step1_complete ? '/setup-wizard/1' : '/setup-wizard/0'}
        replace
      />
    );
  }

  if (status.step2_complete && isSetupRoute) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route element={<SetupGuard />}>
        <Route path="setup-wizard/0" element={<SetupPage />} />
        <Route path="setup-wizard/1" element={<ConfigurePage />} />

        <Route
          path="/"
          element={
            <RoleGuard>
              <DashboardLayout />
            </RoleGuard>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="table" element={<TablePage />} />
          <Route path="room" element={<RoomPage />} />
          <Route path="pos-profile" element={<PosProfilePage />} />
          <Route path="user" element={<UserPage />} />
          <Route path="branch" element={<BranchPage />} />
          <Route path="report-settings" element={<ReportSettingsPage />} />
          <Route path="self-ordering-profile" element={<SelfOrderingProfilePage />} />
          <Route path="production-unit" element={<ProductionUnitPage />} />
          <Route path="production-department" element={<ProductionDepartmentPage />} />
          <Route path="item-production-config" element={<ItemProductionConfigPage />} />
          <Route path="aggregator" element={<AggregatorPage />} />
          <Route path="sales-plan" element={<SalesPlanPage />} />
          <Route path="requirements" element={<RequirementsPage />} />
          <Route path="service" element={<ServicePage />} />
          <Route path="department-stock" element={<DepartmentStockPage />} />
          <Route path="menu-routing" element={<MenuRoutingPage />} />
          <Route path="store-issue" element={<StoreIssuePage />} />
          <Route path="wastage" element={<WastagePage />} />
          <Route
            path="department-profitability"
            element={<DepartmentProfitabilityPage />}
          />
          <Route path="close-day" element={<DayClosePage />} />

          <Route
            path="kot-error-log"
            element={<KotErrorLogPage />}
          />
          <Route path="stock-reservations" element={<StockReservationPage />} />
          <Route path="payment-terminals" element={<PaymentTerminalPage />} />

          <Route
            path="reports/*"
            element={
              <RoleGuard>
                <AuthGuard>
                  <ReportsLayout />
                </AuthGuard>
              </RoleGuard>
            }
          >
            <Route index element={<ReportsHome />} />
            <Route path="today-sales" element={<TodaysSales />} />
            <Route path="daywise-sales" element={<DaywiseSales />} />
            <Route path="daywise-invoices" element={<DaywiseInvoices />} />
            <Route path="month-wise-sales" element={<MonthWiseSales />} />
            <Route path="time-wise-sales" element={<TimeWiseSales />} />
            <Route path="service-wise-sales" element={<ServiceWiseSales />} />
            <Route path="cancelled-invoices" element={<CancelledInvoices />} />
            <Route path="average-bill-value" element={<AverageBillValue />} />
            <Route path="item-wise-sales" element={<ItemWiseSales />} />
            <Route
              path="item-wise-purchase-history"
              element={<ItemWisePurchaseHistory />}
            />
            <Route path="customer-data" element={<CustomerData />} />
            <Route
              path="daywise-customer-details"
              element={<DaywiseCustomerDetails />}
            />
            <Route path="repeated-customers" element={<RepeatedCustomers />} />
            <Route path="employee-sales" element={<EmployeeSales />} />
            <Route
              path="employee-item-wise-sales"
              element={<EmployeeItemWiseSales />}
            />
            <Route
              path="completed-work-orders"
              element={<CompletedWorkOrders />}
            />
            <Route path="daily-pnl" element={<DailyPnl />} />
          </Route>

        </Route>
      </Route>

      {/*
        Phase 3 (PLAN.md tracks/sa-app-consolidation §7 Phase 3): a
        client-side-only role-aware landing redirect for the bare root URL.
        This is a SIBLING of the `SetupGuard` route above (same nesting
        level as the `/ury/pos/*` carve-out below), i.e. it sits OUTSIDE
        `RoleGuard`/`SetupGuard` entirely so a non-manager (e.g. a cashier)
        never hits `RoleGuard`'s dead-end "Access Denied" card just from
        loading "/". `Landing` only decides which area to send the user to
        (`/dashboard` vs `/pos/dashboard`) via `useAuth`'s `isManager` — it
        does not replace any real auth/permission check: `RoleGuard` still
        guards every route under it (including anyone who bookmarks or
        types `/ury/dashboard` directly, bypassing Landing), and pos/'s own
        `AuthGuard` still guards the POS routes. Because this route owns
        the exact "/" match, the `RoleGuard`-wrapped "/" layout route above
        no longer declares an `index` child — it only matches its explicit
        child paths (`dashboard`, `menu`, etc.), never bare "/".
      */}
      <Route path="/" element={<Landing />} />

      {/*
        Phase 2 (PLAN.md tracks/sa-app-consolidation §7 Phase 2): the
        `/ury/pos/*` subtree is a SIBLING of the `SetupGuard` route above,
        not nested inside it. Per the Opus review (§7.5 point 2), SetupGuard
        sits above RoleGuard in the tree and falls back to redirecting into
        the setup wizard on ANY exception from
        `setup_organization.get_wizard_status` — including a cashier session
        that lacks permission on that manager-oriented endpoint. Composing
        pos/'s own guards *underneath* SetupGuard/RoleGuard would still let
        SetupGuard intercept and redirect a cashier before pos/'s guards
        ever ran. So this subtree is carved out to bypass
        SetupGuard/RoleGuard/frontend's AuthGuard entirely and is instead
        gated by pos/'s own POS-Profile-aware `AuthGuard` +
        `POSOpeningProvider` (mounted inside `PosLayout`, see
        pages/Pos/PosLayout.tsx) — cashier/waiter-role-driven, not
        'URY Manager'-driven. Every other route above keeps the original
        SetupGuard -> RoleGuard -> AuthGuard chain unchanged.
      */}
      <Route
        path="pos"
        element={
          <Suspense fallback={<PosRouteFallback />}>
            <PosLayout />
          </Suspense>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PosDashboard />} />
        <Route path="pos" element={<PosPOS />} />
        <Route path="tables" element={<PosTable />} />
        <Route path="orders" element={<PosOrders />} />
        <Route path="settings" element={<PosSettings />} />
        <Route path="open-entries" element={<PosOpenEntries />} />
      </Route>
      <Route
        path="pos/order"
        element={
          <Suspense fallback={<PosRouteFallback />}>
            <CaptainRouteGuard>
              <CaptainTables />
            </CaptainRouteGuard>
          </Suspense>
        }
      />
      <Route
        path="pos/order/table/:table"
        element={
          <Suspense fallback={<PosRouteFallback />}>
            <CaptainRouteGuard>
              <CaptainOrder />
            </CaptainRouteGuard>
          </Suspense>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
