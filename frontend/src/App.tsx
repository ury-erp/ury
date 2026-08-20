import { useEffect, useRef, useState } from 'react';
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
import { AiAssistantSettingsPage } from './pages/Dashboard/AiAssistantSettingsPage';
import ProductionUnitPage from './pages/Dashboard/ProductionUnitPage';
import AggregatorPage from './pages/Dashboard/AggregatorPage';
import { RoleGuard } from './components/RoleGuard';
import { AuthGuard } from './components/AuthGuard';
import { ReportsLayout } from './pages/Reports/ReportsLayout';
import { ActiveReportProvider } from './components/chat/ActiveReportContext';
import ChatWidget, {
  ChatWidgetRefProvider,
  AiEnabledProvider,
  type ChatWidgetHandle,
} from './components/chat/ChatWidget';
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

function useAiSettings() {
  // Fail-closed: no AI surface renders until the backend explicitly says
  // {enabled: true}. Any fetch failure (network, permissions, etc.) leaves
  // this false rather than defaulting open.
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { call } = await import('@ury/core');
        const res = await call.get('ury.ury.api.ury_ai_settings.get_ai_settings');
        const data = res?.message ?? res;
        if (!cancelled && data?.enabled === true) {
          setAiEnabled(true);
        }
      } catch (err) {
        console.error('Error fetching AI settings:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return aiEnabled;
}

function App() {
  const chatRef = useRef<ChatWidgetHandle>(null);
  const aiEnabled = useAiSettings();

  return (
    <ActiveReportProvider>
      <AiEnabledProvider enabled={aiEnabled}>
        <ChatWidgetRefProvider chatRef={chatRef}>
          <AppRoutes />
          {aiEnabled && <ChatWidget ref={chatRef} />}
        </ChatWidgetRefProvider>
      </AiEnabledProvider>
    </ActiveReportProvider>
  );
}

function AppRoutes() {
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
          <Route path="ai-settings" element={<AiAssistantSettingsPage />} />
          <Route path="production-unit" element={<ProductionUnitPage />} />
          <Route path="aggregator" element={<AggregatorPage />} />

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