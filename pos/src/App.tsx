import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import AuthGuard from './components/AuthGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { SkipToContent } from './components/SkipToContent';
import { NetworkStatus } from './components/NetworkStatus';
import { ToastProvider } from './components/ui/toast';
import { usePOSStore } from './store/pos-store';
import { Spinner } from './components/ui/spinner';
import { getActiveLanguage, getActiveDirection, t } from './i18n';
import { registerServiceWorker } from './lib/sw-register';
import { shortcutRegistry } from './lib/keyboard-shortcuts';

const POS = lazy(() => import('./pages/POS'));
const Orders = lazy(() => import('./pages/Orders'));
const Table = lazy(() => import('./pages/Table'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MenuManagement = lazy(() => import('./pages/MenuManagement'));
const Reports = lazy(() => import('./pages/Reports'));

/** Registers global keyboard shortcuts for navigation */
function GlobalShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Map routes to scopes for shortcut activation
    const scopeMap: Record<string, string> = {
      '/': 'pos',
      '/orders': 'orders',
      '/table': 'pos',
      '/dashboard': 'dashboard',
      '/menu-management': 'menu-management',
      '/reports': 'reports',
    };
    const scope = (scopeMap[location.pathname] || 'global') as
      'pos' | 'orders' | 'dashboard' | 'menu-management' | 'reports' | 'global';
    shortcutRegistry.setScope(scope);
  }, [location.pathname]);

  useEffect(() => {
    // Register global navigation shortcuts
    shortcutRegistry.register({
      id: 'nav-pos',
      key: '1',
      modifiers: ['alt'],
      description: 'Navigate to POS',
      scope: 'global',
      handler: () => navigate('/'),
    });
    shortcutRegistry.register({
      id: 'nav-orders',
      key: '2',
      modifiers: ['alt'],
      description: 'Navigate to Orders',
      scope: 'global',
      handler: () => navigate('/orders'),
    });
    shortcutRegistry.register({
      id: 'nav-table',
      key: '3',
      modifiers: ['alt'],
      description: 'Navigate to Tables',
      scope: 'global',
      handler: () => navigate('/table'),
    });
    shortcutRegistry.register({
      id: 'nav-dashboard',
      key: '4',
      modifiers: ['alt'],
      description: 'Navigate to Dashboard',
      scope: 'global',
      handler: () => navigate('/dashboard'),
    });
    shortcutRegistry.register({
      id: 'nav-menu-mgmt',
      key: '5',
      modifiers: ['alt'],
      description: 'Navigate to Menu Management',
      scope: 'global',
      handler: () => navigate('/menu-management'),
    });
    shortcutRegistry.register({
      id: 'nav-reports',
      key: '6',
      modifiers: ['alt'],
      description: 'Navigate to Reports',
      scope: 'global',
      handler: () => navigate('/reports'),
    });

    return () => {
      shortcutRegistry.unregister('nav-pos');
      shortcutRegistry.unregister('nav-orders');
      shortcutRegistry.unregister('nav-table');
      shortcutRegistry.unregister('nav-dashboard');
      shortcutRegistry.unregister('nav-menu-mgmt');
      shortcutRegistry.unregister('nav-reports');
    };
  }, [navigate]);

  return null;
}

function App() {
  const { initializeApp } = usePOSStore();

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
              <ErrorBoundary>
                <GlobalShortcuts />
                <SkipToContent />
                <div
                  className="flex flex-col h-screen bg-gray-100 font-inter"
                  data-testid="app-layout"
                >
                  <Header />
                  <div id="main-content" className="flex-1 overflow-hidden" tabIndex={-1}>
                    <Suspense
                      fallback={
                        <div
                          className="flex items-center justify-center h-full"
                          role="status"
                          aria-label={t('common.loading')}
                        >
                          <div className="text-center">
                            <Spinner />
                            <p className="mt-3 text-sm text-gray-500">{t('common.loading')}</p>
                          </div>
                        </div>
                      }
                    >
                      <Routes>
                        <Route path="/" element={<POS />} />
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
              </ErrorBoundary>
            </Router>
          </POSOpeningProvider>
        </AuthGuard>
      </ScreenSizeProvider>
    </>
  );
}

export default App;
