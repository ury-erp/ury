import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import KotAlertListener from './components/KotAlertListener';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import { usePOSStore } from './store/pos-store';
import { initI18n } from './i18n';

/**
 * Phase 1 (PLAN.md tracks/sa-app-consolidation, §7 Phase 1) layout for the
 * `/ury/pos/*` route subtree, mirroring `pos/src/components/AppLayout.tsx`
 * plus the store/i18n bootstrapping `pos/src/App.tsx` used to do at the app
 * root.
 *
 * Deliberately NOT included here (out of Phase 1's mechanical scope, see
 * PLAN.md §4/§7 Phase 2 and the App.tsx TODO at this subtree's mount point):
 * `AuthGuard`, `POSOpeningProvider`. i18n init is scoped to this subtree only
 * (Phase 0 decision, PLAN.md §7.5 point 4) rather than applied at
 * `document.documentElement` globally, since that would affect the rest of
 * `frontend/`'s non-POS routes too.
 */
const PosLayout = () => {
  const { initializeApp } = usePOSStore();

  useEffect(() => {
    initI18n();
    initializeApp();
  }, [initializeApp]);

  return (
    <ScreenSizeProvider>
      <KotAlertListener />
      <div className="flex flex-col h-screen bg-gray-100 font-inter">
        <Header />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
        <Footer />
      </div>
    </ScreenSizeProvider>
  );
};

export default PosLayout;
