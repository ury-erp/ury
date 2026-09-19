import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  LayoutGrid,
  ClipboardList,
  Table,
  Settings,
} from 'lucide-react';
import { cn } from '@ury/ui';
import { t } from '../i18n';

const Footer = () => {

  const navItems = [
    { icon: LayoutDashboard, label: t('footer.dashboard'), path: '/dashboard' },
    { icon: LayoutGrid, label: t('footer.pos'), path: '/pos' },
    { icon: Table, label: t('footer.tables'), path: '/tables' },
    { icon: ClipboardList, label: t('footer.orders'), path: '/orders' },
    { icon: Settings, label: t('footer.settings'), path: '/settings', hidden: true },
  ].filter((item) => !item.hidden);

  return (
    <div className="bg-[#fffdf8] border-t border-[#eadfce] py-1.5 relative">
      <nav className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-center items-center gap-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[#735d4e] hover:bg-[#fff2d7] hover:text-[#c94b37] transition-colors',
                  isActive && 'bg-[#fff0cb] text-[#c94b37] font-semibold'
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