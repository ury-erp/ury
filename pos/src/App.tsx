import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import AuthGuard from './components/AuthGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import { ToastProvider } from './components/ui/toast';
import { Spinner } from './components/ui';
import { usePOSStore } from './store/pos-store';
import { useEffect } from 'react';
import { getActiveLanguage } from './i18n';

// Lazy-loaded route components for code splitting
const POS = lazy(() => import('./pages/POS'));
const Orders = lazy(() => import('./pages/Orders'));
const Table = lazy(() => import('./pages/Table'));
const MenuManagementPage = lazy(() => import('./pages/MenuManagement'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const ReportsPage = lazy(() => import('./pages/Reports'));

/** Loading fallback shown while lazy route chunks are being fetched */
const RouteLoader = () => (
  <div className="flex items-center justify-center h-full">
    <Spinner className="w-8 h-8" />
  </div>
);

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
            <Router basename="/pos">
              <div className="flex flex-col h-screen bg-gray-100 font-inter">
                <Header />
                <div className="flex-1 overflow-hidden">
                  <Suspense fallback={<RouteLoader />}>
                    <Routes>
                      <Route path="/" element={<POS/>} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/table" element={<Table />} />
                      <Route path="/menu-management" element={<MenuManagementPage />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                    </Routes>
                  </Suspense>
                </div>
                <Footer />
              </div>
            </Router>
          </POSOpeningProvider>
        </AuthGuard>
      </ScreenSizeProvider>
    </>
  );
}

export default App;
