import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Utensils, Search, Plus, LayoutGrid, List, Edit2, Check, X } from 'lucide-react';
import { Card, Button, Badge, Input, Select, Spinner } from '@ury/ui';
import { formatCurrency, call } from '@ury/core';
import { dashboardService } from '../../services/dashboard';
import SideDrawer from '../../components/layout/SideDrawer';

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

type DrawerMode = 'none' | 'add-item' | 'edit-item' | 'add-menu' | 'add-course';

export const MenuPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [menus, setMenus] = useState<URYMenuRecord[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>('');
  const [availableCourses, setAvailableCourses] = useState<{ name: string }[]>([]);

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
  const [newMenu, setNewMenu] = useState({
    menu_name: '',
    branch: '',
    price_list: '',
  });

  // Add course form state
  const [newCourseName, setNewCourseName] = useState('');

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
    setNewMenu({
      menu_name: '',
      branch: activeBranchId !== 'all' ? activeBranchId : '',
      price_list: '',
    });
    setDrawerMode('add-menu');
  };

  const openAddCourseDrawer = () => {
    setNewCourseName('');
    setDrawerMode('add-course');
  };

  const closeDrawer = () => setDrawerMode('none');

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.item_name || !newItem.rate || !newItem.target_menu) return;

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
      }

      if (selectedMenu === newItem.target_menu) {
        fetchMenuItems(selectedMenu);
      }
      closeDrawer();
    } catch (err) {
      console.error('Failed to save Item', err);
    }
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenu.menu_name) return;
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Menu',
          menu_name: newMenu.menu_name,
          branch: newMenu.branch || undefined,
          price_list: newMenu.price_list || undefined,
          items: [],
        },
      });
      await fetchMenus();
      closeDrawer();
    } catch (err) {
      console.error('Failed to create URY Menu', err);
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
      closeDrawer();
    } catch (err) {
      console.error('Failed to create Course', err);
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
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Select
            value={selectedMenu}
            onChange={(e) => setSelectedMenu(e.target.value)}
            className="w-full sm:w-48 bg-gray-50 border-gray-200 focus:ring-primary/20"
          >
            {menus.length === 0 && <option value="">No Menus Found</option>}
            {menus.map((m) => (
              <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>
            ))}
          </Select>

          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-48 bg-gray-50 border-gray-200 focus:ring-primary/20"
          >
            <option value="all">All Courses</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>

          <div className="flex items-center bg-gray-100 p-1 rounded-lg">
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
              onChange={(e) => setSearch(e.target.value)}
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
                    onClick={(e) => { e.stopPropagation(); openEditItemDrawer(item); }}
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

      {/* Add/Edit Item Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-item' || drawerMode === 'edit-item'}
        onClose={closeDrawer}
        title={drawerTitle}
      >
        <form onSubmit={handleSaveItem} className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Target Menu <span className="text-red-500">*</span></label>
            <Select
              value={newItem.target_menu}
              onChange={(e) => setNewItem({ ...newItem, target_menu: e.target.value })}
              className="font-medium"
              required
            >
              {menus.map((m) => (
                <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Item Name <span className="text-red-500">*</span></label>
            <Input
              value={newItem.item_name}
              onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
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
              <Select
                value={newItem.course}
                onChange={(e) => setNewItem({ ...newItem, course: e.target.value })}
              >
                <option value="">None</option>
                {availableCourses.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </Select>
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

      {/* Add New Menu Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-menu'}
        onClose={closeDrawer}
        title="Add New Menu"
      >
        <form onSubmit={handleSaveMenu} className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Menu Name <span className="text-red-500">*</span></label>
            <Input
              value={newMenu.menu_name}
              onChange={(e) => setNewMenu({ ...newMenu, menu_name: e.target.value })}
              required
              className="font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Branch</label>
            <Input
              value={newMenu.branch}
              onChange={(e) => setNewMenu({ ...newMenu, branch: e.target.value })}
              className="font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Price List</label>
            <Input
              value={newMenu.price_list}
              onChange={(e) => setNewMenu({ ...newMenu, price_list: e.target.value })}
              className="font-medium"
            />
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
    </div>
  );
};

export default MenuPage;
