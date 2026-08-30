import { NavLink } from 'react-router-dom';
import {
  Gauge,
  ShoppingCart,
  Table2,
  ReceiptText,
  History,
  Settings,
} from 'lucide-react';
import { cn } from '@ury/ui';
import { t } from '../i18n';

/**
 * The bottom rail is a *same-app* router. Cross-app jumps (the management SPA
 * at /ury) live in the header, marked as external — mixing the two here made
 * "Service Board" look like a sibling tab of /pos when it actually unloads the
 * whole application.
 *
 * Labels follow one rule: a single-word noun, the word a cashier would actually
 * say out loud. Icons are chosen for distinct silhouettes at 20px — the old set
 * was four near-identical grid squares (LayoutDashboard / LayoutGrid / Table /
 * ClipboardList) that were indistinguishable mid-shift.
 */
const Footer = () => {

  // Absolute paths, prefixed with /pos: the sa-app-consolidation merge nested
  // this whole app under frontend/'s router at /ury/pos/*, so an unprefixed
  // absolute path (e.g. "/dashboard") now resolves against the router root
  // and collides with frontend/'s own top-level routes of the same name,
  // instead of staying inside this same-app rail as the comment above intends.
  const navItems = [
    { icon: Gauge, label: t('footer.dashboard'), path: '/pos/dashboard' },
    { icon: ShoppingCart, label: t('footer.pos'), path: '/pos/pos' },
    { icon: Table2, label: t('footer.tables'), path: '/pos/tables' },
    { icon: ReceiptText, label: t('footer.orders'), path: '/pos/orders' },
    { icon: History, label: t('footer.sessions'), path: '/pos/open-entries' },
    { icon: Settings, label: t('footer.settings'), path: '/pos/settings' },
  ];

  return (
    <div className="bg-white border-t border-gray-200 py-1.5 relative">
      <nav className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-center items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  // Same rhythm as the Reports rail: a 28px icon chip carrying
                  // the active state, a 13px medium label, rounded-md hit area.
                  'flex min-w-[4.5rem] flex-col items-center gap-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-gray-600 hover:bg-primary-50 hover:text-primary'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                      isActive ? 'bg-primary text-white shadow-sm' : 'text-current'
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Footer;
