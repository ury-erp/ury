import { useState } from 'react';
import { t } from '../i18n';
import { Star, TrendingUp, Zap } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import OrderPanel from '../components/OrderPanel';
import ProductDialog from '../components/ProductDialog';
import MenuList from '../components/MenuList';
import { usePOSStore, type MenuItem } from '../store/pos-store';
import { cn, ErrorState } from '@ury/ui';
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
    initializeApp,
  } = usePOSStore();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  /**
   * Adds the item straight away.
   *
   * This used to count clicks against a 250ms timer to tell a single click
   * (add) from a double click (customise). The counter and the timer were
   * module-level refs shared by every card, so two quick taps on two
   * *different* items read as one double click: the dialog opened for
   * whichever item was tapped second, and neither was added. A cashier
   * working at speed hit this constantly, and the faster they worked the
   * worse it got.
   *
   * Customising is now its own button on the card, so adding needs no
   * disambiguation window and a tap is answered immediately.
   */
  const handleItemClick = (item: MenuItem) => {
    if (isMenuInteractionDisabled()) return;
    addToOrder({ ...item, quantity: 1 });
  };

  const handleItemCustomize = (item: MenuItem) => {
    if (isMenuInteractionDisabled()) return;
    setSelectedItem(item);
    setIsDialogOpen(true);
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
        <ErrorState
          title={t('pos_page.failed_load')}
          description={error}
          retryLabel={t('common.retry')}
          // Re-runs the failed request rather than reloading the app, which
          // would discard the open order tabs along with the error.
          onRetry={() => initializeApp()}
        />
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

        <MenuList onItemClick={handleItemClick} onItemCustomize={handleItemCustomize} />
      </div>
      <OrderPanel />
      {isDialogOpen && <ProductDialog onClose={() => setIsDialogOpen(false)} />}
    </div>
  );
}
