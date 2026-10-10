import { useEffect, useState } from 'react';
import { ErrorState } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { t } from './i18n';
import { readWizardStatus, type WizardStatus } from './lib/managementValidation';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { call } from '@ury/core';
import SetupPage from './pages/Setup/SetupPage';
import ConfigurePage from './pages/Setup/ConfigurePage';
import DashboardLayout from './components/layout/DashboardLayout';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { InvoiceDetailPage } from './pages/Dashboard/InvoiceDetailPage';
import { PrintersPage } from './pages/Dashboard/PrintersPage';
import { MenuPage } from './pages/Dashboard/MenuPage';
import { TablePage } from './pages/Dashboard/TablePage';
import ReservationPage from './pages/Dashboard/ReservationPage';
import WebsiteEditorPage from './pages/Website/WebsiteEditorPage';
import WaitlistPage from './pages/Dashboard/WaitlistPage';
import FeedbackPage from './pages/Dashboard/FeedbackPage';
import OffersPage from './pages/Dashboard/OffersPage';
import DeliveryPage from './pages/Dashboard/DeliveryPage';
import { RoomPage } from './pages/Dashboard/RoomPage';
import { PosProfilePage } from './pages/Dashboard/PosProfilePage';
import { UserPage } from './pages/Dashboard/UserPage';
import { BranchPage } from './pages/Dashboard/BranchPage';
import { ReportSettingsPage } from './pages/Dashboard/ReportSettingsPage';
import ProductionUnitPage from './pages/Dashboard/ProductionUnitPage';
import AggregatorPage from './pages/Dashboard/AggregatorPage';
import { PurchasesPage } from './pages/Purchases/PurchasesPage';
import { PurchaseFormPage } from './pages/Purchases/PurchaseFormPage';
import { PurchaseDetailPage } from './pages/Purchases/PurchaseDetailPage';
import { InventoryPage } from './pages/Inventory/InventoryPage';
import { RecipesPage } from './pages/Recipes/RecipesPage';
import { RecipeEditorPage } from './pages/Recipes/RecipeEditorPage';
import { RoleGuard } from './components/RoleGuard';
import { FeatureRoute } from './components/FeatureRoute';
import { AuthGuard } from './components/AuthGuard';
import { ReportsLayout } from './pages/Reports/ReportsLayout';
import { ReportsHome } from './pages/Reports/ReportsHome';
import { TodaysSales } from './pages/Reports/TodaysSales';
import { AuditLog } from './pages/Reports/AuditLog';
import { FoodCost } from './pages/Reports/FoodCost';
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

function SetupGuard() {
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatusError(null);

    (async () => {
      try {
        const res = await call<any>(
          'ury.ury.api.minimal.setup_organization.get_wizard_status'
        );
        const wizardStatus = readWizardStatus(res);

        if (!cancelled) {
          setStatusError(null);
          setStatus(wizardStatus);
        }
      } catch (err) {
        // "Could not check" is not "not set up". Defaulting to incomplete
        // sent a live, fully configured restaurant into the setup wizard on
        // a network blip — an answer we never had, presented as fact
        // (UX-13). Unknown is now its own state, with a retry.
        if (!cancelled) {
          setStatus(null);
          setStatusError(parseFrappeError(err, t('dash.errors.setup_check_failed')));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (statusError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <ErrorState
          title={t('dash.errors.setup_check_failed')}
          description={statusError}
          retryLabel={t('common.retry')}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const isSetupRoute = window.location.pathname.startsWith(
    '/restro/setup-wizard/'
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
          <Route path="invoices/:name" element={<InvoiceDetailPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="table" element={<TablePage />} />
          <Route path="reservations" element={<FeatureRoute><ReservationPage /></FeatureRoute>} />
          <Route path="website" element={<FeatureRoute><WebsiteEditorPage /></FeatureRoute>} />
          <Route path="waitlist" element={<FeatureRoute><WaitlistPage /></FeatureRoute>} />
          <Route path="feedback" element={<FeatureRoute><FeedbackPage /></FeatureRoute>} />
          <Route path="offers" element={<FeatureRoute><OffersPage /></FeatureRoute>} />
          <Route path="delivery" element={<FeatureRoute><DeliveryPage /></FeatureRoute>} />
          <Route path="room" element={<RoomPage />} />
          <Route path="pos-profile" element={<PosProfilePage />} />
          <Route path="user" element={<UserPage />} />
          <Route path="branch" element={<BranchPage />} />
          <Route path="report-settings" element={<ReportSettingsPage />} />
          <Route path="production-unit" element={<ProductionUnitPage />} />
          <Route path="printers" element={<PrintersPage />} />
          <Route path="aggregator" element={<AggregatorPage />} />
          <Route path="inventory" element={<FeatureRoute><InventoryPage /></FeatureRoute>} />
          <Route path="recipes" element={<FeatureRoute><RecipesPage /></FeatureRoute>} />
          <Route path="recipes/:item" element={<FeatureRoute><RecipeEditorPage /></FeatureRoute>} />
          <Route path="purchases" element={<FeatureRoute><PurchasesPage /></FeatureRoute>} />
          <Route path="purchases/new" element={<FeatureRoute><PurchaseFormPage key="new" /></FeatureRoute>} />
          <Route path="purchases/:name" element={<FeatureRoute><PurchaseDetailPage /></FeatureRoute>} />
          <Route path="purchases/:name/edit" element={<FeatureRoute><PurchaseFormPage key="edit" /></FeatureRoute>} />

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
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="food-cost" element={<FoodCost />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;