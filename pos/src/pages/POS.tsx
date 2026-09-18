import { useState, useRef, useEffect } from 'react';
import { t } from '../i18n';
import { Star, TrendingUp, Zap } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import OrderPanel from '../components/OrderPanel';
import ProductDialog from '../components/ProductDialog';
import MenuList from '../components/MenuList';
import { usePOSStore } from '../store/pos-store';
import { cn } from '@ury/ui';
import { Spinner } from '@ury/ui';
import InitialLoader from '../components/InitialLoader';

export default function POS() {
  const {
    quickFilter,
    setQuickFilter,
    setSelectedItem,
    addToOrder,
    loading,
    error,
    isMenuInteractionDisabled,
    isInitializing,
  } = usePOSStore();
  
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
        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
        quickFilter === filter
          ? 'bg-[#f05b42] text-white shadow-[0_5px_14px_rgba(240,91,66,0.25)]'
          : 'bg-white text-[#735d4e] border border-[#eadfce] hover:border-[#f0b83e] hover:bg-[#fff8e8]',
        isMenuInteractionDisabled() && 'opacity-50 cursor-not-allowed pointer-events-none'
      )}
      disabled={isMenuInteractionDisabled()}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  if (isInitializing) {
    return <InitialLoader />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold text-red-600 mb-2">{t('pos_page.failed_load')}</p>
          <p className="text-gray-600">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >{t('pos_opening.retry')}</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner message={t('common.loading_menu_items')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">{t('common.error_loading_menu_items')}</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-[#f8f4eb]">
      <Sidebar disabled={isMenuInteractionDisabled()} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pe-96">
        <div className="px-5 py-4 bg-[#fffdf8] border-b border-[#eadfce]">
          <div className="max-w-screen-xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t('pos_page.service_counter')}</p>
                <h1 className="text-xl font-bold tracking-tight text-[#3f2a20]">{t('pos_page.build_an_order')}</h1>
              </div>
              <div className="hidden sm:flex items-center gap-2 rounded-xl bg-[#fff2d7] px-3 py-2 text-xs font-medium text-[#8f6b55]">
                <Zap className="w-3.5 h-3.5 text-[#d89917]" />{t('pos_page.tap_item_hint')}</div>
            </div>
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
  );
}
