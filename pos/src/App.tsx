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
import KotAlertListener from './components/KotAlertListener';
import CaptainRouteGuard from './captain/components/CaptainRouteGuard';
import CaptainTables from './captain/pages/CaptainTables';
import CaptainOrder from './captain/pages/CaptainOrder';
import { ToastProvider } from '@ury/ui';
import { usePOSStore } from './store/pos-store';
import { useEffect, useRef, useState } from 'react';
import { getActiveLanguage } from './i18n';
import { ActiveReportProvider } from './components/chat/ActiveReportContext';
import ChatWidget, {
  ChatWidgetRefProvider,
  AiEnabledProvider,
  type ChatWidgetHandle,
} from './components/chat/ChatWidget';

function useAiSettings() {
  // Fail-closed: no AI surface renders until the backend explicitly says
  // {enabled: true}. Any fetch failure (network, permissions, etc.) leaves
  // this false rather than defaulting open.
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { call } = await import('@ury/core');
        const res = await call.get('ury.ury.api.ury_ai_settings.get_ai_settings');
        const data = res?.message ?? res;
        if (!cancelled && data?.enabled === true) {
          setAiEnabled(true);
        }
      } catch (err) {
        console.error('Error fetching AI settings:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return aiEnabled;
}

function App() {
  const {
    initializeApp
  } = usePOSStore();
  const chatRef = useRef<ChatWidgetHandle>(null);
  const aiEnabled = useAiSettings();

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
      <KotAlertListener />
      <ScreenSizeProvider>
        <AuthGuard>
          <POSOpeningProvider>
            {/*
              PLAN.md item 4: ActiveReportProvider + the floating ChatWidget
              are mounted once here, wrapping the whole routed app shell, so
              every page under both the pos/ dashboard routes and the
              captain "Order" routes shares one chat instance and one
              active-report context. ChatWidgetRefProvider hands the same
              instance's ref down to any page's ⌘K AskBar (see
              components/chat/AskBar.tsx) without prop-threading it through
              AppLayout.
            */}
            <ActiveReportProvider>
              <AiEnabledProvider enabled={aiEnabled}>
                <ChatWidgetRefProvider chatRef={chatRef}>
                  <Router basename="/pos">
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
                  {aiEnabled && <ChatWidget ref={chatRef} />}
                </ChatWidgetRefProvider>
              </AiEnabledProvider>
            </ActiveReportProvider>
          </POSOpeningProvider>
        </AuthGuard>
      </ScreenSizeProvider>
    </>
  );
}

export default App;
