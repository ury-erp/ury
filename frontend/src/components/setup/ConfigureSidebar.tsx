import { useTranslation } from 'react-i18next';
import { useConfigure, SectionId } from '../../context/ConfigureContext';
import { Building2, Map, Grid3X3, UtensilsCrossed, CreditCard, Users, Check } from 'lucide-react';

interface SidebarItem {
  id: SectionId;
  labelKey: string;
  icon: React.ElementType;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'branch', labelKey: 'configure.branch', icon: Building2 },
  { id: 'rooms', labelKey: 'configure.rooms', icon: Map },
  { id: 'tables', labelKey: 'configure.tables', icon: Grid3X3 },
  { id: 'menu', labelKey: 'configure.menu', icon: UtensilsCrossed },
  { id: 'payment', labelKey: 'configure.payment', icon: CreditCard },
  { id: 'users', labelKey: 'configure.users', icon: Users },
];

export function ConfigureSidebar() {
  const { t } = useTranslation();
  const { activeSection, setActiveSection, completedSections } = useConfigure();

  return (
    <nav className="w-full">
      <div className="bg-muted border border-border rounded-lg p-4">
        {/* Section Title */}
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 px-1">
          Configuration
        </h2>

        <div className="space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            const isCompleted = completedSections.has(item.id);
            const Icon = item.icon;

            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative rounded-md ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-sm font-semibold'
                      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-e-full" />
                  )}
                  <div className="flex items-center gap-3 ms-1 min-w-0">
                    <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-start truncate">{t(item.labelKey)}</span>
                  </div>
                  {isCompleted && !isActive && (
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
