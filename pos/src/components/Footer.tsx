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
    {icon: Table, label: t('footer.table'), path: '/table'},
    { icon: ClipboardList, label: t('footer.orders'), path: '/orders' },
  ];

  return (
    <div className="bg-white border-t border-gray-200 py-2 relative">
      <nav className="max-w-screen-xl mx-auto px-4">
        <div className="grid grid-cols-3 items-center gap-4">
          {/* Left: Printer Status */}
          <div className="flex justify-start">
            <PrinterStatusButton />
          </div>

          {/* Center: POS / Table / Orders navigation */}
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

          {/* Right: reserved for future actions, keeps the center column visually centered */}
          <div className="flex justify-end" />
        </div>
      </nav>
    </div>
  );
};

export default Footer; 