import { useConfigure, SectionId } from '../../context/ConfigureContext';
import { Building2, Map, Grid3X3, UtensilsCrossed, CreditCard, Users } from 'lucide-react';

interface SidebarItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'branch', label: 'Branch', icon: Building2 },
  { id: 'rooms', label: 'URY Room', icon: Map },
  { id: 'tables', label: 'URY Table', icon: Grid3X3 },
  { id: 'menu', label: 'URY Menu', icon: UtensilsCrossed },
  { id: 'payment', label: 'Mode of Payment', icon: CreditCard },
  { id: 'users', label: 'User', icon: Users },
];

export function ConfigureSidebar() {
  const { activeSection, setActiveSection } = useConfigure();

  return (
    <nav className="w-full h-full overflow-y-auto">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        {/* Section Title */}
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 px-1">
          Configuration Steps
        </h2>

        <div className="space-y-1">
          {SIDEBAR_ITEMS.map((item, index) => {
            const isActive = activeSection === item.id;
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
                  <div className="flex items-center gap-3 ms-1">
                    <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-start">{item.label}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
