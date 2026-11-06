import { useState, useRef, useEffect } from 'react';
import { t } from '../i18n';
import { Star, TrendingUp, AlertTriangle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import OrderPanel from '../components/OrderPanel';
import ProductDialog from '../components/ProductDialog';
import MenuList from '../components/MenuList';
import { usePOSStore } from '../store/pos-store';
import { useMenu } from '../hooks/useMenu';
import { cn } from '@ury/ui';
import { Spinner } from '@ury/ui';
import InitialLoader from '../components/InitialLoader';

export default function POS() {
  const {
    quickFilter,
    setQuickFilter,
    setSelectedItem,
    addToOrder,
    isMenuInteractionDisabled,
    isInitializing,
  } = usePOSStore();
  const { isLoading: menuLoading, error: menuError, data: menuData } = useMenu();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const handleItemClick = (item: any) => {
    if (isMenuInteractionDisabled()) return;
    
    clickCountRef.current += 1;
    
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        // Single click - add to cart
        addToOrder({ ...item, quantity: 1 });
      } else if (clickCountRef.current >= 2) {
        // Double click - open dialog
        setSelectedItem(item);
        setIsDialogOpen(true);
      }
      clickCountRef.current = 0;
    }, 250); // 250ms threshold for double click
  };

  const QuickFilterButton = ({ filter, icon: Icon, label }: { 
    filter: 'all' | 'special';
    icon: React.ElementType;
    label: string;
  }) => (
    <button
      onClick={() => setQuickFilter(filter)}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        quickFilter === filter
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        isMenuInteractionDisabled() && 'opacity-50 cursor-not-allowed pointer-events-none'
      )}
      disabled={isMenuInteractionDisabled()}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  const hasMenuData = menuData && menuData.length > 0;

  if (isInitializing || (menuLoading && !hasMenuData)) {
    return <InitialLoader />;
  }

  if (menuError && !hasMenuData) {

    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold text-red-600 mb-2">Failed to load POS</p>
          <p className="text-gray-600">{menuError.message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {menuError && hasMenuData && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Working offline. Showing previously cached menu.</span>
        </div>
      )}
      <div className={`flex flex-1 overflow-hidden${menuError && hasMenuData ? ' pt-9' : ''}`}>
        <Sidebar disabled={isMenuInteractionDisabled()} />
        <div className="flex-1 flex flex-col h-screen overflow-hidden pe-96">
          <div className="p-4 bg-white border-b border-gray-200">
            <div className="max-w-screen-xl mx-auto space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden">
                {/* <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onVisibilityChange={setShowSearch}
                  isVisible={showSearch}
                  disabled={isMenuInteractionDisabled()}
                /> */}
                
                <QuickFilterButton filter="all" icon={Star} label={t('common.all')} />
                <QuickFilterButton filter="special" icon={TrendingUp} label={t('menu.special_items')} />
              </div>
            </div>
          </div>

          <MenuList onItemClick={handleItemClick} />
        </div>
        <OrderPanel />
        {isDialogOpen && <ProductDialog onClose={() => setIsDialogOpen(false)} />}
      </div>
    </>
  );
}
