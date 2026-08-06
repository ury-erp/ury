import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import SetupPage from './pages/Setup/SetupPage';
import ConfigurePage from './pages/Setup/ConfigurePage';

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
      <Route path="*" element={<Navigate to="/setup-wizard/0" replace />} />
    </Routes>
  );
}

export default App;
