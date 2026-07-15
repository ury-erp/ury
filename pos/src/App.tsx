import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import Orders from './pages/Orders';
import POS from './pages/POS';
import Table from './pages/Table';
import AuthGuard from './components/AuthGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import { ToastProvider } from './components/ui/toast';
import { usePOSStore } from './store/pos-store';
import { useRootStore } from './store/root-store';
import type { RootState } from './store/root-store';
import { canUserBill } from './lib/role-utils';
import { useEffect } from 'react';
import { getActiveLanguage } from './i18n';

function App() {
  const {
    initializeApp,
    posProfile
  } = usePOSStore();
  const user = useRootStore((state: RootState) => state.user);
  const userCanBill = canUserBill(user, posProfile);
  
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
                  <Routes>
                    <Route path="/" element={<POS/>} />
                    {/* Waiters take orders but never bill: no Orders section. */}
                    <Route
                      path="/orders"
                      element={userCanBill ? <Orders /> : <Navigate to="/" replace />}
                    />
                    <Route path="/table" element={<Table />} />
                  </Routes>
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
