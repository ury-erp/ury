import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Plus,
  ToggleLeft,
  ToggleRight,
  ChefHat,
  Tag,
  Filter,
  ArrowLeft,
  X,
  DollarSign,
} from 'lucide-react';
import { Button, Input, Badge, Spinner } from '../ui';
import { cn } from '../../lib/utils';
import { useMenuManagementStore } from '../../store/menu-management-store';
import { t } from '../../i18n';
import MenuItemsList from './MenuItemsList';
import { SortConfig } from './MenuItemsList';
import CourseManager from './CourseManager';
import AddItemDialog from './AddItemDialog';
import EditItemDialog from './EditItemDialog';
import BulkActionsToolbar from './BulkActionsToolbar';
import BatchPriceUpdateDialog from './BatchPriceUpdateDialog';
import { URYMenuItem } from '../../lib/menu-management-api';

type Tab = 'items' | 'courses';

const MenuManagement = () => {
  const {
    menus,
    selectedMenu,
    courses,
    loading,
    searchQuery,
    selectedCourseFilter,
    fetchMenus,
    fetchCourses,
    fetchAvailableItems,
    toggleMenuStatus,
    setSearchQuery,
    setSelectedCourseFilter,
    clearSelectedMenu,
    updateItemInMenu,
    removeItemFromMenu,
  } = useMenuManagementStore();

  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<URYMenuItem | null>(null);
  const [showCourseManager, setShowCourseManager] = useState(false);
  const [showBatchPriceDialog, setShowBatchPriceDialog] = useState(false);

  // Selection state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Sort state
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  useEffect(() => {
    fetchMenus();
    fetchCourses();
    fetchAvailableItems();
  }, [fetchMenus, fetchCourses, fetchAvailableItems]);

  // Clear selection when menu changes
  useEffect(() => {
    setSelectedItems(new Set());
    setSortConfig(null);
  }, [selectedMenu?.name]);

  const handleMenuSelect = async (menuName: string) => {
    const { fetchMenuDetail } = useMenuManagementStore.getState();
    await fetchMenuDetail(menuName);
  };

  // Sort handler
  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  // Filtered and sorted items (computed before selection handlers so they can reference it)
  const filteredItems = useMemo(() => {
    const items = selectedMenu?.items.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.item.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCourse =
        !selectedCourseFilter || item.course === selectedCourseFilter;
      return matchesSearch && matchesCourse;
    }) || [];

    if (!sortConfig) return items;

    const { key, direction } = sortConfig;
    const sorted = [...items].sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case 'item_name':
          cmp = a.item_name.localeCompare(b.item_name);
          break;
        case 'rate':
          cmp = a.rate - b.rate;
          break;
        case 'course':
          cmp = (a.course || '').localeCompare(b.course || '');
          break;
        case 'disabled':
          cmp = a.disabled - b.disabled;
          break;
        default:
          cmp = 0;
      }
      return direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [selectedMenu, searchQuery, selectedCourseFilter, sortConfig]);

  // Selection handlers
  const handleToggleSelect = useCallback((itemName: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedItems((prev) => {
      if (filteredItems.every((item) => prev.has(item.name))) {
        // Deselect all visible
        return new Set();
      }
      // Select all visible
      return new Set(filteredItems.map((item) => item.name));
    });
  }, [filteredItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  // Bulk action handlers
  const handleEnableSelected = async () => {
    const updates = Array.from(selectedItems);
    for (const itemName of updates) {
      const item = selectedMenu?.items.find((i) => i.name === itemName);
      if (item && item.disabled) {
        await updateItemInMenu(selectedMenu!.name, itemName, { disabled: 0 });
      }
    }
    setSelectedItems(new Set());
  };

  const handleDisableSelected = async () => {
    const updates = Array.from(selectedItems);
    for (const itemName of updates) {
      const item = selectedMenu?.items.find((i) => i.name === itemName);
      if (item && !item.disabled) {
        await updateItemInMenu(selectedMenu!.name, itemName, { disabled: 1 });
      }
    }
    setSelectedItems(new Set());
  };

  const handleDeleteSelected = async () => {
    const count = selectedItems.size;
    if (!confirm(`Delete ${count} selected item${count > 1 ? 's' : ''} from menu?`)) return;

    const updates = Array.from(selectedItems);
    for (const itemName of updates) {
      await removeItemFromMenu(selectedMenu!.name, itemName);
    }
    setSelectedItems(new Set());
  };

  // Get selected URYMenuItem objects for batch price dialog
  const selectedMenuItems = useMemo(() => {
    return filteredItems.filter((item) => selectedItems.has(item.name));
  }, [filteredItems, selectedItems]);

  // Main menu list view (no menu selected)
  if (!selectedMenu) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ChefHat className="w-7 h-7 text-blue-600" />
              {t('menu_management.title') || 'Menu Management'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('menu_management.subtitle') || 'Manage your restaurant menus, items, and categories'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowCourseManager(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Tag className="w-4 h-4" />
              {t('menu_management.manage_courses') || 'Manage Courses'}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'items'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
            onClick={() => setActiveTab('items')}
          >
            {t('menu_management.menus_tab') || 'Menus'}
          </button>
          <button
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'courses'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
            onClick={() => setActiveTab('courses')}
          >
            {t('menu_management.courses_tab') || 'Courses / Categories'}
          </button>
        </div>

        {activeTab === 'items' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-full flex justify-center py-12">
                <Spinner className="w-8 h-8" />
              </div>
            ) : menus.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">{t('menu_management.no_menus') || 'No menus found'}</p>
              </div>
            ) : (
              menus.map((menu) => (
                <div
                  key={menu.name}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleMenuSelect(menu.name)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{menu.name}</h3>
                    <Badge
                      variant={menu.enabled ? 'default' : 'secondary'}
                      className={cn(
                        'text-xs',
                        menu.enabled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      )}
                    >
                      {menu.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{menu.item_count} items</span>
                    <span>{menu.enabled_count} active</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMenuStatus(menu.name, menu.enabled ? 0 : 1);
                      }}
                    >
                      {menu.enabled ? (
                        <ToggleRight className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-gray-400" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <CourseManager />
        )}

        {/* Course Manager Dialog */}
        {showCourseManager && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto m-4">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">{t('menu_management.manage_courses') || 'Manage Courses'}</h2>
                <Button variant="ghost" onClick={() => setShowCourseManager(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-4">
                <CourseManager />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Menu detail view (menu selected)
  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={clearSelectedMenu}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{selectedMenu.name}</h1>
            <p className="text-sm text-gray-500">
              {selectedMenu.items.length} items | Branch: {selectedMenu.branch}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBatchPriceDialog(true)}
            className="flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            {t('menu_management.batch_update_prices') || 'Batch Update Prices'}
          </Button>
          <Button
            onClick={() => setShowAddItemDialog(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('menu_management.add_item') || 'Add Item'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('menu_management.search_items') || 'Search items...'}
            className="ps-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
          >
            <option value="">{t('menu_management.all_courses') || 'All Courses'}</option>
            {courses.map((course) => (
              <option key={course.name} value={course.name}>
                {course.course}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={selectedItems.size}
        onEnableSelected={handleEnableSelected}
        onDisableSelected={handleDisableSelected}
        onDeleteSelected={handleDeleteSelected}
        onBatchUpdatePrices={() => setShowBatchPriceDialog(true)}
        onClearSelection={handleClearSelection}
      />

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {searchQuery
                ? t('menu_management.no_search_results') || 'No items match your search'
                : t('menu_management.no_items') || 'No items in this menu'}
            </p>
          </div>
        </div>
      ) : (
        <MenuItemsList
          items={filteredItems}
          menuName={selectedMenu.name}
          onEditItem={(item) => setEditingItem(item)}
          selectedItems={selectedItems}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          sortConfig={sortConfig}
          onSort={handleSort}
        />
      )}

      {/* Add Item Dialog */}
      {showAddItemDialog && (
        <AddItemDialog
          menuName={selectedMenu.name}
          courses={courses}
          onClose={() => setShowAddItemDialog(false)}
        />
      )}

      {/* Edit Item Dialog */}
      {editingItem && (
        <EditItemDialog
          item={editingItem}
          menuName={selectedMenu.name}
          courses={courses}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Batch Price Update Dialog */}
      {showBatchPriceDialog && selectedMenu && (
        <BatchPriceUpdateDialog
          items={selectedMenuItems.length > 0 ? selectedMenuItems : filteredItems}
          menuName={selectedMenu.name}
          onClose={() => setShowBatchPriceDialog(false)}
        />
      )}
    </div>
  );
};

export default MenuManagement;
