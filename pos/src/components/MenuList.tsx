import { useEffect, useMemo, useRef, useState } from 'react';
import { usePOSStore } from '../store/pos-store';
import { useMenu } from '../hooks/useMenu';
import MenuCard from './MenuCard';
import { Spinner } from '@ury/ui';
import { cn } from '@ury/ui';
import { t } from '../i18n';

interface MenuListProps {
  onItemClick: (item: any) => void;
}

const INITIAL_RENDER_COUNT = 20;
const LOAD_MORE_COUNT = 20;

const MenuList: React.FC<MenuListProps> = ({ onItemClick }) => {
  const {
    error: storeError,
    selectedCategory,
    searchQuery,
    quickFilter,
    isMenuInteractionDisabled,
    isOrderInteractionDisabled
  } = usePOSStore();

  const { data: menuItems = [], isLoading: menuLoading, error: menuError } = useMenu();

  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset visible count whenever filters change so a small filtered set
    // does not retain a previously inflated window.
    setVisibleCount(INITIAL_RENDER_COUNT);
  }, [selectedCategory, searchQuery, quickFilter]);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, filteredItems.length));
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const searchTerm = searchQuery.toLowerCase();
      const matchesCategory = !selectedCategory || !item.course || item.course === selectedCategory;
      const matchesSearch = !searchQuery || 
        item.name.toLowerCase().includes(searchTerm) ||
        item.item.toLowerCase().includes(searchTerm);
      const matchesFilter = quickFilter === 'all' || 
        (quickFilter === 'special' && item.special_dish === 1);
      
      return matchesCategory && matchesSearch && matchesFilter;
    });
  }, [menuItems, selectedCategory, searchQuery, quickFilter]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const hasMore = visibleCount < filteredItems.length;
  const errorMessage = menuError?.message || storeError;
  const hasMenuData = menuItems.length > 0;
  const isInteractionDisabled = isMenuInteractionDisabled() || isOrderInteractionDisabled();

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-screen-xl mx-auto p-4 pb-40">
        {menuLoading && !hasMenuData ? (
          <div className="h-96">
            <Spinner message={t('common.loading_menu_items')} />
          </div>
        ) : errorMessage && !hasMenuData ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-red-600 text-center">
              <p className="text-lg font-medium">{t('common.error_loading_menu_items')}</p>
              <p className="text-sm mt-2">{errorMessage}</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-500 text-center">
              <p className="text-lg font-medium">{t('common.no_items_found')}</p>
              <p className="text-sm mt-2">{t('common.try_adjusting_filters')}</p>
            </div>
          </div>
        ) : (
          <div className={cn(
            "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3",
            isInteractionDisabled && "opacity-50 pointer-events-none"
          )}>
            {visibleItems.map((item) => (
              <MenuCard
                key={item.id}
                id={item.id}
                name={item.name}
                price={item.price}
                item_image={item.image}
                course={item.course_label || item.course}
                item={item.item}
                onClick={() => onItemClick(item)}
                disabled={isInteractionDisabled}
              />
            ))}
            {hasMore && (
              <div
                ref={sentinelRef}
                className="col-span-full h-8"
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuList; 
