import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutGrid, 
  ClipboardList, 
  Table,
  BookLock,
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
    { icon: LayoutGrid, label: t('footer.pos'), path: '/' },
    { icon: Table, label: t('footer.table'), path: '/table' },
    ...(reservationEnabled
      ? [{ icon: BookLock, label: 'Reservations', path: '/reservations' }]
      : []),
    { icon: ClipboardList, label: t('footer.orders'), path: '/orders' },
  ];

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