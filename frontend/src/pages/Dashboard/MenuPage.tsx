import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Utensils, Search, Plus, LayoutGrid, List, Edit2, Check, X, Trash2 } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast } from '@ury/ui';
import { formatCurrency, call } from '@ury/core';
import { dashboardService } from '../../services/dashboard';
import SideDrawer from '../../components/layout/SideDrawer';
import { SearchableSelect } from '../../components/common/SearchableSelect';

interface URYMenuRecord {
  name: string;
  menu_name: string;
}

interface MenuItemRecord {
  name?: string;
  item: string;
  item_name: string;
  course?: string;
  rate?: number;
  image?: string;
  special_dish?: number;
  disabled?: number;
}

interface NewMenuItem {
  id: string;
  item_name: string;
  course: string;
  rate: string;
}

type DrawerMode = 'none' | 'add-item' | 'edit-item' | 'add-menu' | 'add-course' | 'add-price-list';

export const MenuPage: React.FC = () => {
  const { activeBranchId, branches } = useBranchContext();
  const [menus, setMenus] = useState<URYMenuRecord[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>('');
  const [availableCourses, setAvailableCourses] = useState<{ name: string }[]>([]);
  const [priceLists, setPriceLists] = useState<{ name: string }[]>([]);

  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const [drawerMode, setDrawerMode] = useState<DrawerMode>('none');
  const [editingItem, setEditingItem] = useState<MenuItemRecord | null>(null);

  // Add/Edit item form state
  const [newItem, setNewItem] = useState({
    item_name: '',
    rate: '',
    course: '',
    new_course_name: '',
    is_adding_new_course: false,
    target_menu: '',
  });

  // Add new menu form state
  const [newMenu, setNewMenu] = useState<{
    menu_name: string;
    branch: string;
    price_list: string;
    items: NewMenuItem[];
  }>({
    menu_name: '',
    branch: '',
    price_list: '',
    items: [
      {
        id: 'item-1',
        item_name: '',
        course: '',
        rate: '',
      },
    ],
  });

  // Add course form state
  const [newCourseName, setNewCourseName] = useState('');

  // Add price list form state
  const [newPriceListName, setNewPriceListName] = useState('');

  const [availableItems, setAvailableItems] = useState<{ name: string; item_name?: string; standard_rate?: number; custom_course?: string }[]>([]);
  const [menuItemRowToPopulateId, setMenuItemRowToPopulateId] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      const records = await dashboardService.getModuleRecords<any>('Item', 'all');
      setAvailableItems(records || []);
    } catch {
      setAvailableItems([]);
    }
  };

  const fetchPriceLists = async () => {
    try {
      const records = await dashboardService.getModuleRecords<{ name: string }>('Price List', 'all');
      setPriceLists(records || []);
    } catch {
      setPriceLists([]);
    }
  };

  const fetchMenus = async () => {
    try {
      const [records, coursesRes] = await Promise.all([
        dashboardService.getModuleRecords<URYMenuRecord>('URY Menu', activeBranchId),
        dashboardService.getModuleRecords<{ name: string }>('URY Menu Course', activeBranchId),
      ]);
      setMenus(records);
      setAvailableCourses(coursesRes || []);
      if (records.length > 0) {
        setSelectedMenu(records[0].name);
      } else {
        setItems([]);
        setLoading(false);
      }
    } catch {
      setMenus([]);
      setItems([]);
      setLoading(false);
    }
  };

  const fetchMenuItems = async (menuName: string) => {
    if (!menuName) return;
    setLoading(true);
    try {
      const res = await call<any>('frappe.client.get', {
        doctype: 'URY Menu',
        name: menuName,
      });
      const menuDoc = res.message || res;
      setItems(menuDoc.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const coursesRes = await dashboardService.getModuleRecords<{ name: string }>('URY Menu Course', activeBranchId);
      setAvailableCourses(coursesRes || []);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchMenus();
    fetchPriceLists();
    fetchItems();
  }, [activeBranchId]);

  useEffect(() => {
    if (selectedMenu) {
      fetchMenuItems(selectedMenu);
    }
  }, [selectedMenu]);

  const openAddItemDrawer = () => {
    setEditingItem(null);
    setNewItem({
      item_name: '',
      rate: '',
      course: '',
      new_course_name: '',
      is_adding_new_course: false,
      target_menu: selectedMenu,
    });
    setDrawerMode('add-item');
  };

  const openEditItemDrawer = (item: MenuItemRecord) => {
    setEditingItem(item);
    setNewItem({
      item_name: item.item_name || '',
      rate: item.rate?.toString() || '',
      course: item.course || '',
      new_course_name: '',
      is_adding_new_course: false,
      target_menu: selectedMenu,
    });
    setDrawerMode('edit-item');
  };

  const openAddMenuDrawer = () => {
    const defaultBranch = activeBranchId !== 'all' ? activeBranchId : (branches[0]?.name || '');
    setNewMenu({
      menu_name: '',
      branch: defaultBranch,
      price_list: priceLists[0]?.name || '',
      items: [
        {
          id: `item-${Date.now()}`,
          item_name: '',
          course: availableCourses[0]?.name || 'Main Course',
          rate: '',
        },
      ],
    });
    setDrawerMode('add-menu');
  };

  const handleAddNewMenuItem = () => {
    setNewMenu((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          item_name: '',
          course: availableCourses[0]?.name || 'Main Course',
          rate: '',
        },
      ],
    }));
  };

  const handleUpdateNewMenuItem = (id: string, patch: Partial<NewMenuItem>) => {
    setNewMenu((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  };

  const handleRemoveNewMenuItem = (id: string) => {
    setNewMenu((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id),
    }));
  };

  const openAddCourseDrawer = () => {
    setNewCourseName('');
    setDrawerMode('add-course');
  };

  const closeDrawer = () => {
    if (menuItemRowToPopulateId) {
      setDrawerMode('add-menu');
      setMenuItemRowToPopulateId(null);
    } else {
      setDrawerMode('none');
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.item_name || !newItem.rate || (!menuItemRowToPopulateId && !newItem.target_menu)) return;

    let resolvedCourse = newItem.course;

    // If adding a new course inline, create it first
    if (newItem.is_adding_new_course && newItem.new_course_name.trim()) {
      try {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'URY Menu Course',
            course: newItem.new_course_name.trim(),
          },
        });
        resolvedCourse = newItem.new_course_name.trim();
        await fetchCourses();
        showToast.success('Course created successfully');
      } catch (err) {
        console.error('Failed to create course', err);
      }
    }

    try {
      if (editingItem) {
        const res = await call<any>('frappe.client.get', { doctype: 'URY Menu', name: newItem.target_menu });
        const menuDoc = res.message || res;
        const rowIndex = menuDoc.items.findIndex((row: any) => row.name === editingItem.name);
        if (rowIndex !== -1) {
          menuDoc.items[rowIndex].item_name = newItem.item_name;
          menuDoc.items[rowIndex].rate = parseFloat(newItem.rate);
          menuDoc.items[rowIndex].course = resolvedCourse;
          await call('frappe.client.save', { doc: menuDoc });
          showToast.success('Item updated successfully');
        }
      } else {
        const insertRes = await call<any>('frappe.client.insert', {
          doc: {
            doctype: 'Item',
            item_code: newItem.item_name,
            item_name: newItem.item_name,
            item_group: 'All Item Groups',
            stock_uom: 'Nos',
            standard_rate: parseFloat(newItem.rate),
            is_sales_item: 1,
            is_stock_item: 0,
            custom_course: resolvedCourse,
          },
        });
        const createdItem = insertRes.message || insertRes;

        if (menuItemRowToPopulateId) {
          await fetchItems();
          setNewMenu((prev) => {
            const updatedItems = prev.items.map((row) =>
              row.id === menuItemRowToPopulateId
                ? {
                    ...row,
                    item_name: createdItem.name,
                    course: resolvedCourse || row.course || availableCourses[0]?.name || 'Main Course',
                    rate: newItem.rate,
                  }
                : row
            );
            const targetIdx = updatedItems.findIndex((row) => row.id === menuItemRowToPopulateId);
            if (targetIdx === updatedItems.length - 1) {
              updatedItems.push({
                id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                item_name: '',
                course: availableCourses[0]?.name || 'Main Course',
                rate: '',
              });
            }
            return { ...prev, items: updatedItems };
          });
          setMenuItemRowToPopulateId(null);
          setDrawerMode('add-menu');
          showToast.success('Item created successfully');
        } else {
          const res = await call<any>('frappe.client.get', { doctype: 'URY Menu', name: newItem.target_menu });
          const menuDoc = res.message || res;
          if (!menuDoc.items) menuDoc.items = [];
          menuDoc.items.push({
            item: createdItem.name,
            item_name: newItem.item_name,
            course: resolvedCourse,
            rate: parseFloat(newItem.rate),
          });
          await call('frappe.client.save', { doc: menuDoc });
          showToast.success('Item created successfully');
        }
      }

      if (!menuItemRowToPopulateId && selectedMenu === newItem.target_menu) {
        fetchMenuItems(selectedMenu);
      }
      if (!menuItemRowToPopulateId) {
        closeDrawer();
      }
    } catch (err) {
      console.error('Failed to save Item', err);
    }
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenu.menu_name.trim()) {
      showToast.error('Menu Name is required');
      return;
    }
    const branchToUse = newMenu.branch || (activeBranchId !== 'all' ? activeBranchId : branches[0]?.name);
    if (!branchToUse) {
      showToast.error('Branch is required');
      return;
    }

    const validItems = newMenu.items.filter((it) => it.item_name.trim());
    if (validItems.length === 0) {
      showToast.error('At least one Menu Item is required');
      return;
    }

    try {
      const childRows = [];
      for (const item of validItems) {
        const itemCode = item.item_name.trim();
        const matched = availableItems.find((it) => it.name === itemCode || it.item_name === itemCode);
        const itemRate = matched?.standard_rate || parseFloat(item.rate) || 0;
        const itemCourse = matched?.custom_course || item.course || '';

        childRows.push({
          item: matched ? matched.name : itemCode,
          item_name: matched ? (matched.item_name || matched.name) : itemCode,
          rate: itemRate,
          course: itemCourse,
        });
      }

      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Menu',
          name: newMenu.menu_name.trim(),
          branch: branchToUse,
          price_list: newMenu.price_list || "",
          enabled: 1,
          items: childRows,
        },
      });

      await fetchMenus();
      setSelectedMenu(newMenu.menu_name.trim());
      showToast.success('Menu created successfully');
      closeDrawer();
    } catch (err: any) {
      console.error('Failed to create URY Menu', err);
      showToast.error(err.message || 'Failed to create URY Menu');
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Menu Course',
          course: newCourseName.trim(),
        },
      });
      await fetchCourses();
      showToast.success('Course created successfully');
      closeDrawer();
    } catch (err) {
      console.error('Failed to create Course', err);
    }
  };

  const handleSavePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPriceListName.trim()) return;
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Price List',
          price_list_name: newPriceListName.trim(),
          enabled: 1,
          buying: 0,
          selling: 1,
        },
      });
      await fetchPriceLists();
      showToast.success('Price List created successfully');
      setNewMenu(prev => ({ ...prev, price_list: newPriceListName.trim() }));
      setDrawerMode('add-menu');
    } catch (err) {
      console.error('Failed to create Price List', err);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = (item.item_name || item.item || '').toLowerCase().includes(search.toLowerCase());
    const matchesGroup = categoryFilter === 'all' || item.course === categoryFilter;
    return matchesSearch && matchesGroup;
  });

  const categories = Array.from(new Set(items.map((i) => i.course).filter(Boolean))) as string[];

  const isDrawerOpen = drawerMode !== 'none';
  const drawerTitle =
    drawerMode === 'add-item' ? 'Add Menu Item'
    : drawerMode === 'edit-item' ? 'Edit Menu Item'
    : drawerMode === 'add-menu' ? 'Add New Menu'
    : drawerMode === 'add-course' ? 'Add New Course'
    : '';

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">

      {/* Section: Menu Selector — Partition Style */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-full sm:w-48">
            <SearchableSelect
              id="selected-menu"
              value={selectedMenu}
              options={menus.map((m) => ({ value: m.name, label: m.menu_name || m.name }))}
              placeholder="Select Menu..."
              onChange={(_, val) => setSelectedMenu(val)}
            />
          </div>

          <div className="w-full sm:w-48">
            <SearchableSelect
              id="category-filter"
              value={categoryFilter}
              options={[
                { value: 'all', label: 'All Courses' },
                ...categories.map((c) => ({ value: c, label: c }))
              ]}
              placeholder="Select Course..."
              onChange={(_, val) => setCategoryFilter(val)}
            />
          </div>

          <div className="flex items-center bg-gray-100 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all flex items-center justify-center ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all flex items-center justify-center ${viewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="pl-9 bg-gray-50 border-gray-200 w-full"
            />
          </div>

          <Button
            variant="outline"
            onClick={openAddCourseDrawer}
            className="border-gray-300 text-gray-700 font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Course</span>
          </Button>

          <Button
            variant="outline"
            onClick={openAddMenuDrawer}
            className="border-gray-300 text-gray-700 font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu</span>
          </Button>

          <Button
            onClick={openAddItemDrawer}
            disabled={menus.length === 0}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-24 flex items-center justify-center bg-white rounded-xl border border-gray-100 shadow-sm">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-16 flex flex-col items-center justify-center text-center rounded-xl border border-gray-100 shadow-sm bg-white">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Utensils className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No Items Found</h3>
          <p className="text-gray-500 mb-8 max-w-sm">
            {search || categoryFilter !== 'all'
              ? "We couldn't find any items matching your filters."
              : 'Your menu is empty. Start adding delicious items for your customers!'}
          </p>
          <Button
            onClick={openAddItemDrawer}
            disabled={menus.length === 0}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs px-6"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu Item</span>
          </Button>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredItems.map((item, idx) => (
            <div key={item.name || idx} className="bg-white rounded-lg shadow-sm overflow-hidden transition-shadow relative h-56 flex flex-col group">
              <div className="h-24 w-full shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.item_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center text-2xl text-gray-400 font-medium select-none">
                    {(item.item_name || 'IT').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 p-3 flex flex-col">
                <h3 className="font-medium text-gray-900 text-sm leading-5 line-clamp-2" title={item.item_name}>
                  {item.item_name}
                </h3>
                <div className="h-5 mt-1">
                  <p className="text-xs text-gray-500 truncate" title={item.course || ''}>{item.course || ' '}</p>
                </div>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(item.rate || 0)}
                  </span>
                  <button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEditItemDrawer(item); }}
                    className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors -mr-1.5 -mb-1.5"
                    title="Edit Item"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600 min-w-[600px]">
            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Course</th>
                <th className="px-6 py-4">Standard Rate</th>
                <th className="px-6 py-4 text-center">Special</th>
                <th className="px-6 py-4 text-center">Disabled</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item, idx) => (
                <tr key={item.name || idx} className="transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                        <Utensils className="w-4 h-4 text-gray-400" />
                      </div>
                      {item.item_name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600 text-xs font-medium">
                      {item.course || 'None'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 font-bold text-primary">{formatCurrency(item.rate || 0)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {item.special_dish ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {item.disabled ? <Check className="w-4 h-4 text-red-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEditItemDrawer(item)} className="text-gray-500 hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add New Menu Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-menu' || menuItemRowToPopulateId !== null}
        onClose={closeDrawer}
        title="Add New Menu"
      >
        <form onSubmit={handleSaveMenu} className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Menu Name <span className="text-red-500">*</span></label>
            <Input
              value={newMenu.menu_name}
              onChange={(e) => setNewMenu({ ...newMenu, menu_name: e.target.value })}
              placeholder="e.g. Sea food menu"
              required
              className="font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Branch <span className="text-red-500">*</span></label>
            <SearchableSelect
              id="menu_branch"
              value={newMenu.branch}
              onChange={(_, value) => setNewMenu({ ...newMenu, branch: value })}
              options={branches.map((b) => ({ value: b.name, label: b.name }))}
              placeholder="Select Branch..."
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Price List</label>
            <SearchableSelect
              id="price_list"
              value={newMenu.price_list}
              onChange={(_, value) => setNewMenu({ ...newMenu, price_list: value })}
              options={priceLists.map(p => ({ value: p.name, label: p.name }))}
              placeholder="Select Price List..."
              actionText="Create New Price List"
              onAction={() => setDrawerMode('add-price-list')}
            />
          </div>

          <div className="pt-2 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block font-semibold text-gray-700">Menu Items <span className="text-red-500">*</span></label>
                <p className="text-xs text-gray-500">Select initial item(s) to create the menu</p>
              </div>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {newMenu.items.map((item, idx) => (
                <div key={item.id} className="p-3 bg-gray-50/80 rounded-lg border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Item #{idx + 1}</span>
                    {newMenu.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveNewMenuItem(item.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Remove Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div>
                    <SearchableSelect
                      id={`item-select-${item.id}`}
                      value={item.item_name}
                      onChange={(_, value) => handleUpdateNewMenuItem(item.id, { item_name: value })}
                      options={availableItems.map((it) => ({ value: it.name, label: it.item_name || it.name }))}
                      placeholder="Select Item..."
                      actionText="Create New Item"
                      onAction={() => {
                        setMenuItemRowToPopulateId(item.id);
                        setNewItem({
                          item_name: '',
                          rate: '',
                          course: item.course || availableCourses[0]?.name || '',
                          new_course_name: '',
                          is_adding_new_course: false,
                          target_menu: '',
                        });
                        setDrawerMode('add-item');
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <SearchableSelect
                        id={`item-course-${item.id}`}
                        value={item.course}
                        onChange={(_, value) => handleUpdateNewMenuItem(item.id, { course: value })}
                        options={availableCourses.map((c) => ({ value: c.name, label: c.name }))}
                        placeholder="Course..."
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        placeholder="Rate (₹)"
                        value={item.rate}
                        onChange={(e) => handleUpdateNewMenuItem(item.id, { rate: e.target.value })}
                        required
                        min="0"
                        step="any"
                        className="text-xs h-8 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-gray-100">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold">Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs">
              Create Menu
            </Button>
          </div>
        </form>
      </SideDrawer>

      {/* Add New Course Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-course'}
        onClose={closeDrawer}
        title="Add New Course"
      >
        <form onSubmit={handleSaveCourse} className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Course Name <span className="text-red-500">*</span></label>
            <Input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              required
              className="font-medium"
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-gray-100">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold">Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs">
              Create Course
            </Button>
          </div>
        </form>
      </SideDrawer>

      {/* Add New Price List Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-price-list'}
        onClose={() => setDrawerMode('add-menu')}
        title="Add New Price List"
      >
        <form onSubmit={handleSavePriceList} className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Price List Name <span className="text-red-500">*</span></label>
            <Input
              value={newPriceListName}
              onChange={(e) => setNewPriceListName(e.target.value)}
              required
              className="font-medium"
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-gray-100">
            <Button type="button" variant="outline" onClick={() => setDrawerMode('add-menu')} className="font-semibold">Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs">
              Create Price List
            </Button>
          </div>
        </form>
      </SideDrawer>

      {/* Add/Edit Item Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-item' || drawerMode === 'edit-item'}
        onClose={closeDrawer}
        title={drawerTitle}
      >
        <form onSubmit={handleSaveItem} className="space-y-5 text-sm">
          {!menuItemRowToPopulateId && (
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">Target Menu <span className="text-red-500">*</span></label>
              <SearchableSelect
                id="target_menu"
                value={newItem.target_menu}
                onChange={(_, value) => setNewItem({ ...newItem, target_menu: value })}
                options={menus.map(m => ({ value: m.name, label: m.menu_name || m.name }))}
              />
            </div>
          )}

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Item Name <span className="text-red-500">*</span></label>
            <Input
              value={newItem.item_name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItem({ ...newItem, item_name: e.target.value })}
              required
              className="font-medium"
            />
          </div>

          {/* Course field with inline add option */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-semibold text-gray-700">Course</label>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, is_adding_new_course: !newItem.is_adding_new_course, course: '' })}
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
              >
                {newItem.is_adding_new_course ? (
                  'Choose existing'
                ) : (
                  <><Plus className="w-3 h-3" /> Add new course</>
                )}
              </button>
            </div>
            {newItem.is_adding_new_course ? (
              <Input
                placeholder="New course name"
                value={newItem.new_course_name}
                onChange={(e) => setNewItem({ ...newItem, new_course_name: e.target.value })}
                className="font-medium"
              />
            ) : (
              <SearchableSelect
                id="course"
                value={newItem.course}
                onChange={(_, value) => setNewItem({ ...newItem, course: value })}
                options={[
                  { value: '', label: 'None' },
                  ...availableCourses.map(c => ({ value: c.name, label: c.name }))
                ]}
              />
            )}
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Standard Rate (₹) <span className="text-red-500">*</span></label>
            <Input
              type="number"
              value={newItem.rate}
              onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
              required
              className="font-medium"
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-gray-100">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold">Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs">
              {editingItem ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default MenuPage;
