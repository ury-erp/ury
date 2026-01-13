import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  ClipboardList,
  Table,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

const Footer = () => {
  const { t } = useTranslation();

  const navItems = [
    { icon: LayoutGrid, label: t('nav.pos', 'POS'), path: '/' },
    { icon: Table, label: t('nav.table', 'Table'), path: '/table' },
    { icon: ClipboardList, label: t('nav.orders', 'Orders'), path: '/orders' },
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