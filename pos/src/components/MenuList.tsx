import { useEffect, useMemo } from 'react';
import { usePOSStore, type MenuItem } from '../store/pos-store';
import MenuCard from './MenuCard';
import { EmptyState, Skeleton, cn } from '@ury/ui';
import { SearchX, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import { t } from '../i18n';

interface MenuListProps {
  onItemClick: (item: MenuItem) => void;
  /** Opens the item's options panel. Separate from onItemClick so adding an
      item never has to wait on a double-click window (UX-01). */
  onItemCustomize: (item: MenuItem) => void;
}

const MenuList: React.FC<MenuListProps> = ({ onItemClick, onItemCustomize }) => {
  const {
    menuItems,
    menuLoading,
    error,
    selectedCategory,
    searchQuery,
    quickFilter,
    fetchMenuItems,
    isMenuInteractionDisabled,
    isOrderInteractionDisabled
  } = usePOSStore();

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const searchTerm = searchQuery.toLowerCase();
      const matchesCategory = !selectedCategory || item.course === selectedCategory;
      const matchesSearch = !searchQuery || 
        item.name.toLowerCase().includes(searchTerm) ||
        item.item.toLowerCase().includes(searchTerm);
      const matchesFilter = quickFilter === 'all' || 
        (quickFilter === 'special' && item.special_dish === 1);
      
      return matchesCategory && matchesSearch && matchesFilter;
    });
  }, [menuItems, selectedCategory, searchQuery, quickFilter]);

  const isInteractionDisabled = isMenuInteractionDisabled() || isOrderInteractionDisabled();

  const gridClasses =
    'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4';

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-screen-xl mx-auto p-5 pb-40">
        {menuLoading ? (
          /* Skeleton cards in the real grid, rather than a centred spinner:
             the menu keeps its shape so nothing shifts under the cashier's
             finger when the items land. */
          <div className={gridClasses} aria-busy="true" aria-label={t('common.loading_menu_items')}>
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} shape="block" className="h-60" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            className="h-96"
            icon={<AlertTriangle />}
            title={t('common.error_loading_menu_items')}
            description={error}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            className="h-96"
            icon={searchQuery || selectedCategory ? <SearchX /> : <UtensilsCrossed />}
            title={t('common.no_items_found')}
            description={t('common.try_adjusting_filters')}
          />
        ) : (
          <div className={cn(
            gridClasses,
            isInteractionDisabled && "opacity-50 pointer-events-none"
          )}>
            {filteredItems.map((item, index) => (
              <MenuCard
                key={item.id}
                index={index}
                id={item.id}
                name={item.name}
                price={item.price}
                item_image={item.image}
                course={item.course_label || item.course}
                item={item.item}
                onClick={() => onItemClick(item)}
                onCustomize={() => onItemCustomize(item)}
                disabled={isInteractionDisabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuList; 