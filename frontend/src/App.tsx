import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
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

function SetupGuard() {
  // @ts-ignore
  const setupComplete = window.frappe?.boot?.setup_complete;
  if (setupComplete === 1) {
    window.location.href = '/app';
    return null;
  }
  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route element={<SetupGuard />}>
        <Route path="setup-wizard/0" element={<SetupPage />} />
        <Route path="setup-wizard/1" element={<ConfigurePage />} />
      </Route>

      <Route path="ury" element={<DashboardLayout />}>
        <Route index element={<Navigate to="/ury/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="table" element={<TablePage />} />
        <Route path="room" element={<RoomPage />} />
        <Route path="pos-profile" element={<PosProfilePage />} />
        <Route path="user" element={<UserPage />} />
        <Route path="branch" element={<BranchPage />} />
        <Route path="report-settings" element={<ReportSettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/setup-wizard/0" replace />} />
    </Routes>
  );
}

export default App;
