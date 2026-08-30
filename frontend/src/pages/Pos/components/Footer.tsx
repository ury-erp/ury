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
 * say out loud. Icons are chosen for distinct silhouettes at 18px — the old set
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
    <nav className="h-[60px] flex-none bg-card border-t border-hair flex items-stretch justify-center gap-[2px] px-3 relative">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            cn(
              'w-[92px] flex flex-col items-center justify-center gap-[3px] text-text-tertiary text-[11px] relative transition-colors hover:text-foreground',
              isActive && 'text-primary font-[550]'
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute top-0 left-[22px] right-[22px] h-[2px] bg-primary rounded-b-[2px]"
                  aria-hidden="true"
                />
              )}
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
};

export default Footer;
