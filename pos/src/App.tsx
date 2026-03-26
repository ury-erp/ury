import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import { useEffect, lazy, Suspense } from 'react';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// Lazy load settings pages
const SettingsLayout = lazy(() => import('./components/SettingsLayout'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const RolesPage = lazy(() => import('./pages/admin/RolesPage'));

function App() {
  const {
    initializeApp
  } = usePOSStore();
  
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return (
    <>
      <ToastProvider />
      <ScreenSizeProvider>
        <AuthGuard>
          <POSOpeningProvider>
            <PermissionsProvider>
              <Router basename="/pos">
                <div className="flex flex-col h-screen bg-gray-100 font-inter">
                  <Header />
                  <div className="flex-1 overflow-hidden">
                    <Suspense fallback={<div className="flex items-center justify-center h-full">Loading...</div>}>
                      <Routes>
                        <Route path="/" element={<POS/>} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/table" element={<Table />} />
                        
                        {/* Settings Routes */}
                        <Route path="/settings" element={
                          <ProtectedRoute requiredCapability="users.manage">
                            <SettingsLayout />
                          </ProtectedRoute>
                        }>
                          <Route index element={<UsersPage />} />
                          <Route path="users" element={<UsersPage />} />
                          <Route path="roles" element={
                            <ProtectedRoute requiredCapability="roles.manage">
                              <RolesPage />
                            </ProtectedRoute>
                          } />
                        </Route>
                      </Routes>
                    </Suspense>
                  </div>
                  <Footer />
                </div>
              </Router>
            </PermissionsProvider>
          </POSOpeningProvider>
        </AuthGuard>
      </ScreenSizeProvider>
    </>
  );
}

export default App;
