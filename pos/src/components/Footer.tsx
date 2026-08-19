import { NavLink } from 'react-router-dom';
import { 
  LayoutGrid, 
  ClipboardList, 
  Table,
} from 'lucide-react';
import { cn } from '@ury/ui';
import { t } from '../i18n';
import { PrinterStatusButton } from './PrinterWatch';

const Footer = () => {
  const navItems = [
    { icon: LayoutGrid, label: t('footer.pos'), path: '/' },
    { icon: Table, label: t('footer.table'), path: '/table' },
    { icon: ClipboardList, label: t('footer.orders'), path: '/orders' },
  ];

  return (
    <div className="bg-white border-t border-gray-200 py-1.5 relative">
      <nav className="w-full px-6">
        <div className="grid grid-cols-3 items-center">
          {/* Left: Printer Status aligned to the left edge */}
          <div className="flex justify-start items-center">
            <PrinterStatusButton />
          </div>

          {/* Center: POS / Table / Orders navigation */}
          <div className="flex justify-center items-center gap-6">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center px-4 py-1 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors',
                    isActive && 'text-blue-600 font-medium'
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs mt-0.5">{item.label}</span>
              </NavLink>
            ))}
          </div>

          {/* Right: empty container maintaining absolute center alignment for the middle column */}
          <div className="flex justify-end items-center" />
        </div>
      </nav>
    </div>
  );
};

export default Footer; 