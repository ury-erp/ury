import { NavLink } from 'react-router-dom';
import {
  Gauge,
  ShoppingCart,
  Armchair,
  ReceiptText,
  Wallet,
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

  const navItems = [
    { icon: Gauge, label: t('footer.dashboard'), path: '/dashboard' },
    { icon: ShoppingCart, label: t('footer.pos'), path: '/pos' },
    { icon: Armchair, label: t('footer.tables'), path: '/tables' },
    { icon: ReceiptText, label: t('footer.orders'), path: '/orders' },
    { icon: Wallet, label: t('footer.sessions'), path: '/open-entries' },
    { icon: Settings, label: t('footer.settings'), path: '/settings' },
  ];

  return (
    <div className="bg-white border-t border-border py-1.5 relative">
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
                      isActive ? 'bg-foreground text-background shadow-sm' : 'text-current'
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
