import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import KotAlertListener from './components/KotAlertListener';
import ScreenSizeProvider from './components/ScreenSizeProvider';
import AuthGuard from './components/AuthGuard';
import POSOpeningProvider from './components/POSOpeningProvider';
import { usePOSStore } from './store/pos-store';
import { initI18n } from './i18n';

/**
 * Layout for the `/ury/pos/*` route subtree, mirroring
 * `pos/src/components/AppLayout.tsx` plus the store/i18n bootstrapping
 * `pos/src/App.tsx` used to do at the app root.
 *
 * Phase 2 (PLAN.md tracks/sa-app-consolidation §7 Phase 2 / §7.5 point 2):
 * this subtree is mounted as a SIBLING of `frontend/`'s
 * SetupGuard/RoleGuard/AuthGuard chain in App.tsx (not nested under it), so
 * pos/'s own POS-Profile-aware `AuthGuard` + `POSOpeningProvider` are
 * mounted HERE to gate the subtree instead. This mirrors the nesting order
 * pos/src/App.tsx used: AuthGuard -> POSOpeningProvider -> routed layout
 * chrome (Header/Footer), so Header/Footer only render once auth and the
 * POS opening/checklist state are both resolved. `KotAlertListener` stays
 * outside the guards, matching pos/src/App.tsx (it was a sibling of
 * `ScreenSizeProvider`/`AuthGuard`, not nested inside them).
 *
 * i18n init is scoped to this subtree only (Phase 0 decision, PLAN.md §7.5
 * point 4) rather than applied at `document.documentElement` globally,
 * since that would affect the rest of `frontend/`'s non-POS routes too.
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
      <AuthGuard>
        <POSOpeningProvider>
          <div className="flex flex-col h-screen bg-muted font-inter">
            <Header />
            <div className="flex-1 overflow-hidden">
              <Outlet />
            </div>
            <Footer />
          </div>
        </POSOpeningProvider>
      </AuthGuard>
    </ScreenSizeProvider>
  );
};

export default PosLayout;
