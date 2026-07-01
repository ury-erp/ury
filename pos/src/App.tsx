import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import AuthGuard from './components/AuthGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import { NetworkStatus } from './components/NetworkStatus';
import { ToastProvider } from './components/ui/toast';
import { usePOSStore } from './store/pos-store';
import { Spinner } from './components/ui/spinner';
import { getActiveLanguage, getActiveDirection } from './i18n';
import { registerServiceWorker } from './lib/sw-register';

const POS = lazy(() => import('./pages/POS'));
const Orders = lazy(() => import('./pages/Orders'));
const Table = lazy(() => import('./pages/Table'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MenuManagement = lazy(() => import('./pages/MenuManagement'));
const Reports = lazy(() => import('./pages/Reports'));

function App() {
  const {
    initializeApp
  } = usePOSStore();
  
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    document.documentElement.dir = getActiveDirection();
    document.documentElement.lang = getActiveLanguage() || 'en';
  }, []);

  // Register service worker for PWA support
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return (
    <>
      <ToastProvider />
      <NetworkStatus />
      <ScreenSizeProvider>
        <AuthGuard>
          <POSOpeningProvider>
            <Router basename="/pos">
              <div className="flex flex-col h-screen bg-gray-100 font-inter">
                <Header />
                <div className="flex-1 overflow-hidden">
                  <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <Spinner />
                  </div>
                }>
                  <Routes>
                    <Route path="/" element={<POS/>} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/table" element={<Table />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/menu-management" element={<MenuManagement />} />
                    <Route path="/reports" element={<Reports />} />
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
