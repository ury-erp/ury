import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  LayoutGrid,
  ClipboardList,
  Table,
  BookLock,
  Settings,
} from 'lucide-react';
import { cn } from '@ury/ui';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';
import { getBranchReservationSettings } from '../lib/table-api';

const Footer = () => {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch ?? null;
  const [reservationEnabled, setReservationEnabled] = useState(false);

  useEffect(() => {
    if (!branch) {
      setReservationEnabled(false);
      return;
    }

    let isMounted = true;
    getBranchReservationSettings(branch)
      .then((settings) => {
        if (isMounted) {
          setReservationEnabled(settings.enable_reservation !== 0);
        }
      })
      .catch(() => {
        if (isMounted) {
          setReservationEnabled(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [branch]);

  const navItems = [
    { icon: LayoutDashboard, label: t('footer.dashboard'), path: '/dashboard' },
    { icon: LayoutGrid, label: t('footer.pos'), path: '/pos' },
    { icon: Table, label: t('footer.tables'), path: '/tables' },
    ...(reservationEnabled
      ? [{ icon: BookLock, label: t('footer.reservations') || 'Reservations', path: '/reservations' }]
      : []),
    { icon: ClipboardList, label: t('footer.orders'), path: '/orders' },
    { icon: Settings, label: t('footer.settings'), path: '/settings', hidden: true },
  ].filter((item) => !item.hidden);

  return (
    <div className="bg-white border-t border-gray-200 py-2 relative">
      <nav className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-center items-center gap-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors',
                  isActive && 'text-blue-600'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Footer;