import { useEffect, useState } from 'react';
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
import { DepartmentStockPage } from './pages/Dashboard/DepartmentStockPage';
import { DepartmentProfitabilityPage } from './pages/Dashboard/DepartmentProfitabilityPage';
import { KotErrorLogPage } from './pages/Dashboard/KotErrorLogPage';
import { StockReservationPage } from './pages/Dashboard/StockReservationPage';
import { PaymentTerminalPage } from './pages/Dashboard/PaymentTerminalPage';
import { RoleGuard } from './components/RoleGuard';
import { AuthGuard } from './components/AuthGuard';
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
          <Route index element={<Navigate to="/dashboard" replace />} />
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
          <Route path="department-stock" element={<DepartmentStockPage />} />
          <Route
            path="department-profitability"
            element={<DepartmentProfitabilityPage />}
          />

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

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
