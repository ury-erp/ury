import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { BranchProvider } from '../../context/BranchContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { t } from '../../i18n';
import { useModalFocus } from '../../hooks/useModalFocus';
// import { Footer } from './Footer';

/**
 * The management shell.
 *
 * The sidebar was a fixed 256px column with no drawer, so below roughly
 * 1024px it ate the width the forms and report tables needed and there was
 * no way to put it away (UX-14). It is now permanent from `lg` up and a
 * dismissible drawer below, which is the same component either way — one
 * navigation tree, not a narrow duplicate that drifts.
 */
export const DashboardLayout: React.FC = () => {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const navRef = useModalFocus(navOpen, () => setNavOpen(false));

  // Navigating closes the drawer. Leaving it open over the page the user just
  // asked for is the classic way a mobile nav becomes a trap.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (query.matches) setNavOpen(false); };
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <BranchProvider>
      <div className="h-screen flex flex-col bg-background text-foreground text-sm overflow-hidden">
        <Header />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Permanent from lg up. */}
          <div className="hidden lg:flex">
            <Sidebar />
          </div>

          {/* Drawer below lg. */}
          {navOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
                onClick={() => setNavOpen(false)}
              />
              <div
                ref={navRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={t('nav.navigation')}
                className="absolute inset-y-0 start-0 flex flex-col max-w-[85vw] bg-background shadow-2xl"
              >
                <button type="button" onClick={() => setNavOpen(false)} className="self-end p-3" aria-label={t('common.close')}>
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="min-h-0 flex-1"><Sidebar /></div>
              </div>
            </div>
          )}

          <main className="flex-1 p-4 sm:p-6 overflow-y-auto min-w-0">
            {/* Only control that appears below lg, so the permanent layout is
                unchanged on the desks this is mostly used from. */}
            <button
              type="button"
              onClick={() => setNavOpen((open) => !open)}
              aria-expanded={navOpen}
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium lg:hidden"
            >
              {navOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              {t('nav.navigation')}
            </button>

            <Outlet />
          </main>
        </div>
        {/* <Footer /> */}
      </div>
    </BranchProvider>
  );
};

export default DashboardLayout;
