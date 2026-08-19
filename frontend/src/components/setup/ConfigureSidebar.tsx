import { useConfigure, SectionId } from '../../context/ConfigureContext';
import { Building2, Map, Grid3X3, UtensilsCrossed, CreditCard, Users, Check } from 'lucide-react';

interface SidebarItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'branch', label: 'Branch', icon: Building2 },
  { id: 'rooms', label: 'Rooms', icon: Map },
  { id: 'tables', label: 'Tables', icon: Grid3X3 },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'payment', label: 'Payments', icon: CreditCard },
  { id: 'users', label: 'User', icon: Users },
];

export function ConfigureSidebar() {
  const { activeSection, setActiveSection, completedSections } = useConfigure();

  return (
    <nav className="w-full">
      <div className="bg-muted border border-border rounded-lg p-4">
        {/* Section Title */}
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 px-1">
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
                      ? 'bg-card text-foreground shadow-sm font-semibold'
                      : 'text-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-e-full" />
                  )}
                  <div className="flex items-center gap-3 ms-1">
                    <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-start">{item.label}</span>
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
