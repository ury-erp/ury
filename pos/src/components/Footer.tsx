import { NavLink } from 'react-router-dom';
import { 
  LayoutGrid, 
  ClipboardList, 
  Table,
  BarChart3,
  ChefHat,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { t } from '../i18n';

const Footer = () => {

  const navItems = [
    { icon: LayoutGrid, label: t('footer.pos') || 'POS', path: '/' },
    { icon: Table, label: t('footer.table') || 'Table', path: '/table' },
    { icon: ClipboardList, label: t('footer.orders') || 'Orders', path: '/orders' },
    { icon: BarChart3, label: t('footer.dashboard') || 'Dashboard', path: '/dashboard' },
    { icon: ChefHat, label: t('footer.menu') || 'Menu', path: '/menu-management' },
    { icon: FileText, label: t('footer.reports') || 'Reports', path: '/reports' },
  ];

  return (
    <div className="bg-white border-t border-gray-200 py-2 relative">
      <nav className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-center items-center gap-1 sm:gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center px-2 sm:px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors',
                  isActive && 'text-blue-600 bg-blue-50'
                )
              }
            >
              <item.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] sm:text-xs mt-0.5">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Footer; 