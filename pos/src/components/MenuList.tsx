import { useEffect, useMemo } from 'react';
import { usePOSStore } from '../store/pos-store';
import MenuCard from './MenuCard';
import { Spinner } from './ui/spinner';
import { cn } from '../lib/utils';
import { t } from '../i18n';

interface MenuListProps {
  onItemClick: (item: any) => void;
}

const MenuList: React.FC<MenuListProps> = ({ onItemClick }) => {
  const {
    menuItems,
    menuLoading,
    error,
    selectedCategory,
    searchQuery,
    quickFilter,
    fetchMenuItems,
    isMenuInteractionDisabled,
    isOrderInteractionDisabled,
    posProfile
  } = usePOSStore();

  const showItemCode = !!posProfile?.show_item_code;

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  // Search relevance, not document order: typing "6" has to put item 6 first,
  // then the codes that start with 6 (60PAM, 61, 62...), and only then the
  // items that merely contain a 6 somewhere. Lower score = better match.
  const matchScore = (item: { name: string; item: string; item_code?: string }, term: string) => {
    const code = (item.item_code || item.item || '').toLowerCase();
    const name = item.name.toLowerCase();

    if (code === term) return 0;
    if (name === term) return 1;
    if (code.startsWith(term)) return 2;
    if (name.startsWith(term)) return 3;
    // A word start inside the name ("fried" in "Chicken Fried Rice") still beats
    // a match buried mid-word.
    if (name.split(/\s+/).some(word => word.startsWith(term))) return 4;
    if (code.includes(term)) return 5;
    if (name.includes(term)) return 6;
    return -1;
  };

  const filteredItems = useMemo(() => {
    const searchTerm = searchQuery.trim().toLowerCase();

    const matched = menuItems.filter(item => {
      const matchesCategory = !selectedCategory || item.course === selectedCategory;
      const matchesSearch = !searchTerm || matchScore(item, searchTerm) >= 0;
      const matchesFilter = quickFilter === 'all' ||
        (quickFilter === 'special' && item.special_dish === 1);

      return matchesCategory && matchesSearch && matchesFilter;
    });

    if (!searchTerm) return matched;

    return [...matched].sort((a, b) => {
      const scoreDiff = matchScore(a, searchTerm) - matchScore(b, searchTerm);
      if (scoreDiff !== 0) return scoreDiff;

      // Same bucket: the shorter code is the closer match ("6" before "60PAM").
      const codeA = a.item_code || a.item || '';
      const codeB = b.item_code || b.item || '';
      if (codeA.length !== codeB.length) return codeA.length - codeB.length;
      return a.name.localeCompare(b.name);
    });
  }, [menuItems, selectedCategory, searchQuery, quickFilter]);

  const isInteractionDisabled = isMenuInteractionDisabled() || isOrderInteractionDisabled();

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="mx-auto p-3 pb-24">
        {menuLoading ? (
          <div className="h-96">
            <Spinner message={t('common.loading_menu_items')} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-red-600 text-center">
              <p className="text-lg font-medium">{t('common.error_loading_menu_items')}</p>
              <p className="text-sm mt-2">{error}</p>
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
          // auto-fill instead of fixed breakpoints: every pixel freed by the
          // narrower course rail / order panel turns into another column
          // rather than into wider cards
          <div className={cn(
            "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5",
            isInteractionDisabled && "opacity-50 pointer-events-none"
          )}>
            {filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                id={item.id}
                name={item.name}
                price={item.price}
                item_image={item.image}
                course={item.course_label || item.course}
                item={item.item}
                item_code={item.item_code}
                showItemCode={showItemCode}
                onClick={() => onItemClick(item)}
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