import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Orders from './pages/Orders';
import POS from './pages/POS';
import Table from './pages/Table';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AuthGuard from './components/AuthGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import CaptainRouteGuard from './captain/components/CaptainRouteGuard';
import CaptainTables from './captain/pages/CaptainTables';
import CaptainOrder from './captain/pages/CaptainOrder';
import { ToastProvider } from '@ury/ui';
import { usePOSStore } from './store/pos-store';
import { useEffect } from 'react';
import { getActiveLanguage } from './i18n';

function App() {
  const {
    initializeApp
  } = usePOSStore();
  
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    const lang = getActiveLanguage();
    const isRtl = ['ar', 'he', 'fa', 'ur', 'ku'].includes(lang);
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang || 'en';
  }, []);
  return (
    <>
      <ToastProvider />
      <ScreenSizeProvider>
        <AuthGuard>
          <POSOpeningProvider>
            <Router basename="/ury">
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/pos" element={<POS />} />
                  <Route path="/tables" element={<Table />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                {/*
                  Captain "Order" module — its own shell, sibling to the
                  Cashier POS routes above, not nested under AppLayout
                  (PLAN.md §6/§10: own navigation, mobile-first, not the
                  desktop Header/Footer shell). This Router (basename
                  "/ury") is already the outer app-nesting layer that mounts
                  "/pos" today, so "/order" sits alongside it here rather
                  than in a separate outer router file.
                */}
                <Route
                  path="/order"
                  element={
                    <CaptainRouteGuard>
                      <CaptainTables />
                    </CaptainRouteGuard>
                  }
                />
                <Route
                  path="/order/table/:table"
                  element={
                    <CaptainRouteGuard>
                      <CaptainOrder />
                    </CaptainRouteGuard>
                  }
                />
              </Routes>
            </Router>
          </POSOpeningProvider>
        </AuthGuard>
      </ScreenSizeProvider>
    </>
  );
}

export default App;
