import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Utensils, Search, Plus, LayoutGrid, List, Edit2, Check, X } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast, Select } from '@ury/ui';
import { formatCurrency, call } from '@ury/core';
import { dashboardService } from '../../services/dashboard';
import SideDrawer from '../../components/layout/SideDrawer';
import { PageToolbar } from '../../components/layout/PageToolbar';
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

  // Saving state for three handlers
  const [savingItem, setSavingItem] = useState<boolean>(false);
  const [savingMenu, setSavingMenu] = useState<boolean>(false);
  const [savingCourse, setSavingCourse] = useState<boolean>(false);

  // Options for Branch and Price List selects
  const [branchOptions, setBranchOptions] = useState<{ name: string; title?: string }[]>([]);
  const [priceListOptions, setPriceListOptions] = useState<{ name: string; title?: string }[]>([]);

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
  const [newCourseIcon, setNewCourseIcon] = useState('');

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

  const fetchBranches = async () => {
    try {
      const branches = await dashboardService.getModuleRecords<{ name: string; title?: string }>('Branch', activeBranchId);
      setBranchOptions(branches || []);
    } catch {
      setBranchOptions([]);
    }
  };

  const fetchPriceLists = async () => {
    try {
      const priceLists = await dashboardService.getModuleRecords<{ name: string; title?: string }>('Price List', activeBranchId);
      setPriceListOptions(priceLists || []);
    } catch {
      setPriceListOptions([]);
    }
  };

  useEffect(() => {
    fetchMenus();
    fetchBranches();
    fetchPriceLists();
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
    setNewCourseIcon('');
    setDrawerMode('add-course');
  };

  const closeDrawer = () => setDrawerMode('none');

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.item_name || !newItem.rate || !newItem.target_menu) return;

    setSavingItem(true);
    let resolvedCourse = newItem.course;

    try {
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

      if (editingItem) {
        const res = await call<any>('frappe.client.get', { doctype: 'URY Menu', name: newItem.target_menu });
        const menuDoc = res.message || res;
        const rowIndex = menuDoc.items.findIndex((row: any) => row.name === editingItem.name);
        if (rowIndex === -1) {
          showToast.error('Could not find the item to update');
          return;
        }
        menuDoc.items[rowIndex].item_name = newItem.item_name;
        menuDoc.items[rowIndex].rate = parseFloat(newItem.rate);
        menuDoc.items[rowIndex].course = resolvedCourse;
        await call('frappe.client.save', { doc: menuDoc });
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
      showToast.success('Item saved');
      closeDrawer();
    } catch (err) {
      console.error('Failed to save Item', err);
      showToast.error('Failed to save item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenu.menu_name) return;
    setSavingMenu(true);
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
      showToast.success('Menu saved');
      closeDrawer();
    } catch (err) {
      console.error('Failed to create URY Menu', err);
      showToast.error('Failed to save menu');
    } finally {
      setSavingMenu(false);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setSavingCourse(true);
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Menu Course',
          course: newCourseName.trim(),
          icon: newCourseIcon || undefined,
        },
      });
      await fetchCourses();
      showToast.success('Course saved');
      closeDrawer();
    } catch (err) {
      console.error('Failed to create Course', err);
      showToast.error('Failed to save course');
    } finally {
      setSavingCourse(false);
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
      <PageToolbar className="flex-col md:flex-row justify-between">
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

          <div className="flex items-center bg-muted p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all flex items-center justify-center ${viewMode === 'grid' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all flex items-center justify-center ${viewMode === 'list' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted border-border w-full"
            />
          </div>

          <Button
            variant="outline"
            onClick={openAddCourseDrawer}
            className="font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Course</span>
          </Button>

          <Button
            variant="outline"
            onClick={openAddMenuDrawer}
            className="font-semibold flex items-center gap-1.5 whitespace-nowrap"
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
      </PageToolbar>

      {/* Content Area */}
      {loading ? (
        <div className="py-24 flex items-center justify-center bg-card rounded-xl border border-border shadow-sm">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-16 flex flex-col items-center justify-center text-center rounded-xl border border-border shadow-sm bg-card">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Utensils className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">No Items Found</h3>
          <p className="text-muted-foreground mb-8 max-w-sm">
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
            <div key={item.name || idx} className="bg-card rounded-lg shadow-sm overflow-hidden transition-shadow relative h-56 flex flex-col group">
              <div className="h-24 w-full shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.item_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-2xl text-muted-foreground font-medium select-none">
                    {(item.item_name || 'IT').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 p-3 flex flex-col">
                <h3 className="font-medium text-foreground text-sm leading-5 line-clamp-2" title={item.item_name}>
                  {item.item_name}
                </h3>
                <div className="h-5 mt-1">
                  <p className="text-xs text-muted-foreground truncate" title={item.course || ''}>{item.course || ' '}</p>
                </div>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCurrency(item.rate || 0)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditItemDrawer(item); }}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-colors -mr-1.5 -mb-1.5"
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
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm text-muted-foreground min-w-[600px]">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Course</th>
                <th className="px-6 py-4">Standard Rate</th>
                <th className="px-6 py-4 text-center">Special</th>
                <th className="px-6 py-4 text-center">Disabled</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item, idx) => (
                <tr key={item.name || idx} className="transition-colors">
                  <td className="px-6 py-4 font-semibold text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Utensils className="w-4 h-4 text-muted-foreground" />
                      </div>
                      {item.item_name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="border-border bg-muted text-muted-foreground text-xs font-medium">
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
            <label className="block font-semibold text-foreground mb-1.5">Target Menu <span className="text-red-500">*</span></label>
            <SearchableSelect
              id="target_menu"
              value={newItem.target_menu}
              onChange={(_, value) => setNewItem({ ...newItem, target_menu: value })}
              options={menus.map(m => ({ value: m.name, label: m.menu_name || m.name }))}
            />
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1.5">Item Name <span className="text-red-500">*</span></label>
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
              <label className="block font-semibold text-foreground">Course</label>
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
            <label className="block font-semibold text-foreground mb-1.5">Standard Rate (₹) <span className="text-red-500">*</span></label>
            <Input
              type="number"
              value={newItem.rate}
              onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
              required
              className="font-medium"
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-border">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold" disabled={savingItem}>Cancel</Button>
            <Button type="submit" disabled={savingItem} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs flex items-center gap-2">
              {savingItem && <Spinner className="w-4 h-4" />}
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
            <label className="block font-semibold text-foreground mb-1.5">Menu Name <span className="text-red-500">*</span></label>
            <Input
              value={newMenu.menu_name}
              onChange={(e) => setNewMenu({ ...newMenu, menu_name: e.target.value })}
              required
              className="font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1.5">Branch</label>
            <SearchableSelect
              id="branch"
              value={newMenu.branch}
              onChange={(_, value) => setNewMenu({ ...newMenu, branch: value })}
              options={[
                { value: '', label: 'None' },
                ...branchOptions.map(b => ({ value: b.name, label: b.title || b.name }))
              ]}
              placeholder="Select Branch..."
            />
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1.5">Price List</label>
            <SearchableSelect
              id="price_list"
              value={newMenu.price_list}
              onChange={(_, value) => setNewMenu({ ...newMenu, price_list: value })}
              options={[
                { value: '', label: 'None' },
                ...priceListOptions.map(p => ({ value: p.name, label: p.title || p.name }))
              ]}
              placeholder="Select Price List..."
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-border">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold" disabled={savingMenu}>Cancel</Button>
            <Button type="submit" disabled={savingMenu} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs flex items-center gap-2">
              {savingMenu && <Spinner className="w-4 h-4" />}
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
            <label className="block font-semibold text-foreground mb-1.5">Course Name <span className="text-red-500">*</span></label>
            <Input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              required
              className="font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-foreground mb-1.5">Icon</label>
            <Select
              value={newCourseIcon}
              onChange={(e) => setNewCourseIcon(e.target.value)}
              className="font-medium"
            >
              <option value="">None</option>
              <option value="Utensils">Utensils</option>
              <option value="Coffee">Coffee</option>
              <option value="IceCream">Ice Cream</option>
              <option value="Salad">Salad</option>
              <option value="Pizza">Pizza</option>
              <option value="Beef">Beef</option>
              <option value="Fish">Fish</option>
              <option value="Wine">Wine</option>
              <option value="Soup">Soup</option>
              <option value="Sandwich">Sandwich</option>
            </Select>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-border">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold" disabled={savingCourse}>Cancel</Button>
            <Button type="submit" disabled={savingCourse} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs flex items-center gap-2">
              {savingCourse && <Spinner className="w-4 h-4" />}
              Create Course
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default MenuPage;
