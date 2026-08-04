import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import SetupPage from './pages/setup/SetupPage';
import ConfigurePage from './pages/setup/ConfigurePage';

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
        <Route index element={<SetupPage />} />
        <Route path="configure" element={<ConfigurePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
