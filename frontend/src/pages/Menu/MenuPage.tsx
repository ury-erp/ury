import React, { useState, useMemo, useRef } from 'react';
import {
  Button,
  Input,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@ury/ui';
import { formatCurrency } from '@ury/core';
import Drawer from '../../components/common/Drawer';
import {
  Search,
  Plus,
  Upload,
  FileSpreadsheet,
  Grid,
  List,
  Edit,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  Utensils,
  MoreVertical,
  Percent,
  Layers,
  Sparkles,
} from 'lucide-react';

export interface MenuItemData {
  id: string;
  name: string;
  course: string;
  price: number;
  enabled: boolean;
  special_dish: boolean;
  image_url?: string;
}

export interface MenuData {
  id: string;
  menu_name: string;
  branch: string;
  price_list: string;
  is_enabled: boolean;
  tax_type: 'Inclusive' | 'Exclusive';
  tax_percentage: number;
  items: MenuItemData[];
}

const INITIAL_MENUS: MenuData[] = [
  {
    id: 'menu-1',
    menu_name: 'Main Dining Menu',
    branch: 'Main Branch',
    price_list: 'Standard Rate',
    is_enabled: true,
    tax_type: 'Exclusive',
    tax_percentage: 5.0,
    items: [
      {
        id: 'item-1',
        name: 'Butter Chicken',
        course: 'Main Course',
        price: 380,
        enabled: true,
        special_dish: true,
      },
      {
        id: 'item-2',
        name: 'Paneer Tikka',
        course: 'Appetizer',
        price: 260,
        enabled: true,
        special_dish: false,
      },
      {
        id: 'item-3',
        name: 'Garlic Naan',
        course: 'Side Dish',
        price: 60,
        enabled: true,
        special_dish: false,
      },
      {
        id: 'item-4',
        name: 'Mango Lassi',
        course: 'Beverage',
        price: 110,
        enabled: true,
        special_dish: true,
      },
      {
        id: 'item-5',
        name: 'Gulab Jamun',
        course: 'Dessert',
        price: 140,
        enabled: true,
        special_dish: false,
      },
    ],
  },
  {
    id: 'menu-2',
    menu_name: 'Happy Hour Menu',
    branch: 'Downtown Branch',
    price_list: 'Happy Hour Rate',
    is_enabled: true,
    tax_type: 'Inclusive',
    tax_percentage: 5.0,
    items: [
      {
        id: 'item-6',
        name: 'Craft Beer Pint',
        course: 'Beverage',
        price: 180,
        enabled: true,
        special_dish: true,
      },
      {
        id: 'item-7',
        name: 'Loaded Nachos',
        course: 'Appetizer',
        price: 220,
        enabled: true,
        special_dish: false,
      },
      {
        id: 'item-8',
        name: 'Crispy Wings',
        course: 'Starter',
        price: 250,
        enabled: true,
        special_dish: true,
      },
    ],
  },
  {
    id: 'menu-3',
    menu_name: 'Weekend Brunch Special',
    branch: 'Beachfront Outpost',
    price_list: 'VIP Rate',
    is_enabled: false,
    tax_type: 'Exclusive',
    tax_percentage: 5.0,
    items: [
      {
        id: 'item-9',
        name: 'Avocado Toast',
        course: 'Starter',
        price: 290,
        enabled: false,
        special_dish: true,
      },
      {
        id: 'item-10',
        name: 'Berry Smoothie Bowl',
        course: 'Dessert',
        price: 240,
        enabled: true,
        special_dish: false,
      },
    ],
  },
];

const COURSES = ['All Courses', 'Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Starter', 'Side Dish'];
const BRANCHES = ['All Branches', 'Main Branch', 'Downtown Branch', 'Beachfront Outpost', 'Express Outlet'];
const STATUSES = ['All Statuses', 'Enabled', 'Disabled'];
const PRICE_LISTS = ['Standard Rate', 'Happy Hour Rate', 'VIP Rate', 'Delivery Rate'];

export default function MenuPage() {
  const [menus, setMenus] = useState<MenuData[]>(INITIAL_MENUS);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('All Courses');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuData | null>(null);

  // Form State
  const [formMenuName, setFormMenuName] = useState('');
  const [formBranch, setFormBranch] = useState('Main Branch');
  const [formPriceList, setFormPriceList] = useState('Standard Rate');
  const [formIsEnabled, setFormIsEnabled] = useState(true);
  const [formTaxType, setFormTaxType] = useState<'Inclusive' | 'Exclusive'>('Exclusive');
  const [formTaxPercentage, setFormTaxPercentage] = useState(5.0);
  const [formItems, setFormItems] = useState<MenuItemData[]>([]);

  // Action Menu dropdown tracker
  const [activeMenuActionId, setActiveMenuActionId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const openAddDrawer = () => {
    setEditingMenu(null);
    setFormMenuName('');
    setFormBranch('Main Branch');
    setFormPriceList('Standard Rate');
    setFormIsEnabled(true);
    setFormTaxType('Exclusive');
    setFormTaxPercentage(5.0);
    setFormItems([
      {
        id: `item-${Date.now()}-1`,
        name: '',
        course: 'Main Course',
        price: 0,
        enabled: true,
        special_dish: false,
      },
    ]);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (menu: MenuData) => {
    setEditingMenu(menu);
    setFormMenuName(menu.menu_name);
    setFormBranch(menu.branch);
    setFormPriceList(menu.price_list);
    setFormIsEnabled(menu.is_enabled);
    setFormTaxType(menu.tax_type);
    setFormTaxPercentage(menu.tax_percentage);
    setFormItems([...menu.items.map((i) => ({ ...i }))]);
    setIsDrawerOpen(true);
  };

  const handleSaveMenu = () => {
    if (!formMenuName.trim()) return;

    if (editingMenu) {
      setMenus((prev) =>
        prev.map((m) =>
          m.id === editingMenu.id
            ? {
                ...m,
                menu_name: formMenuName,
                branch: formBranch,
                price_list: formPriceList,
                is_enabled: formIsEnabled,
                tax_type: formTaxType,
                tax_percentage: formTaxPercentage,
                items: formItems,
              }
            : m
        )
      );
    } else {
      const newMenu: MenuData = {
        id: `menu-${Date.now()}`,
        menu_name: formMenuName,
        branch: formBranch,
        price_list: formPriceList,
        is_enabled: formIsEnabled,
        tax_type: formTaxType,
        tax_percentage: formTaxPercentage,
        items: formItems,
      };
      setMenus((prev) => [newMenu, ...prev]);
    }
    setIsDrawerOpen(false);
  };

  const handleDuplicateMenu = (menu: MenuData) => {
    const duplicated: MenuData = {
      ...menu,
      id: `menu-${Date.now()}`,
      menu_name: `${menu.menu_name} (Copy)`,
      items: menu.items.map((it) => ({ ...it, id: `item-${Date.now()}-${Math.random()}` })),
    };
    setMenus((prev) => [duplicated, ...prev]);
    setActiveMenuActionId(null);
  };

  const handleToggleMenuStatus = (menuId: string) => {
    setMenus((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, is_enabled: !m.is_enabled } : m))
    );
    setActiveMenuActionId(null);
  };

  const handleDeleteMenu = (menuId: string) => {
    setMenus((prev) => prev.filter((m) => m.id !== menuId));
    setActiveMenuActionId(null);
  };

  // Item management inside Drawer
  const handleAddFormItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        name: '',
        course: 'Main Course',
        price: 0,
        enabled: true,
        special_dish: false,
      },
    ]);
  };

  const handleUpdateFormItem = (itemId: string, patch: Partial<MenuItemData>) => {
    setFormItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveFormItem = (itemId: string) => {
    setFormItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Filtered menus and items
  const filteredMenus = useMemo(() => {
    return menus.filter((menu) => {
      // Search
      const matchesSearch =
        searchQuery === '' ||
        menu.menu_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        menu.items.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

      // Branch filter
      const matchesBranch = selectedBranch === 'All Branches' || menu.branch === selectedBranch;

      // Status filter
      const matchesStatus =
        selectedStatus === 'All Statuses' ||
        (selectedStatus === 'Enabled' && menu.is_enabled) ||
        (selectedStatus === 'Disabled' && !menu.is_enabled);

      // Course filter
      const matchesCourse =
        selectedCourse === 'All Courses' ||
        menu.items.some((i) => i.course === selectedCourse);

      return matchesSearch && matchesBranch && matchesStatus && matchesCourse;
    });
  }, [menus, searchQuery, selectedBranch, selectedStatus, selectedCourse]);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      alert(`Menu imported successfully from ${e.target.files[0].name}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Utensils className="w-7 h-7 text-[#7C3AED]" />
            Menu Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage menus, dish items, course pricing, and tax configurations across branches.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json,.pdf,.png,.jpg"
            className="hidden"
          />
          <input
            type="file"
            ref={csvInputRef}
            onChange={handleFileImport}
            accept=".csv"
            className="hidden"
          />

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <Upload className="w-4 h-4 text-[#7C3AED]" />
            Upload Menu
          </Button>

          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            className="gap-2 border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#7C3AED]" />
            Import CSV
          </Button>

          <Button
            onClick={openAddDrawer}
            className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Menu
          </Button>
        </div>
      </div>

      {/* Toolbar: Search, Filters & View Toggle */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search menu or dish name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-50/50 border-gray-200 focus:border-[#7C3AED] focus:ring-[#7C3AED]"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Course filter */}
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          >
            {COURSES.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>

          {/* Branch filter */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          >
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-[#7C3AED] shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-[#7C3AED] shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMenus.map((menu) => (
            <Card
              key={menu.id}
              className="rounded-xl border border-gray-200 bg-white hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col"
            >
              <CardHeader className="p-5 border-b border-gray-100 bg-gray-50/30 flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold text-gray-900">
                      {menu.menu_name}
                    </CardTitle>
                    <Badge variant={menu.is_enabled ? 'success' : 'cancelled'}>
                      {menu.is_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-gray-500 mt-1">
                    {menu.branch} • {menu.price_list}
                  </CardDescription>
                </div>

                {/* Quick actions dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveMenuActionId(activeMenuActionId === menu.id ? null : menu.id)
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {activeMenuActionId === menu.id && (
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuActionId(null);
                          openEditDrawer(menu);
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#7C3AED] flex items-center gap-2"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit Menu
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateMenu(menu)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#7C3AED] flex items-center gap-2"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleMenuStatus(menu.id)}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#7C3AED] flex items-center gap-2"
                      >
                        {menu.is_enabled ? (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            Disable Menu
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            Enable Menu
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMenu(menu.id)}
                        className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Menu
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-5 flex-1 space-y-4">
                {/* Menu items summary list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span>Dish Items ({menu.items.length})</span>
                    <span>Price</span>
                  </div>

                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden bg-white">
                    {menu.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Dish placeholder fallback icon component */}
                          <div className="w-9 h-9 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                            <Utensils className="w-4 h-4 text-[#7C3AED]" />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {item.name || 'Unnamed Dish'}
                              </span>
                              {item.special_dish && (
                                <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                  <Sparkles className="w-2.5 h-2.5 mr-0.5 inline" />
                                  Special
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">{item.course}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(item.price)}
                          </span>
                          <div>
                            <span
                              className={`text-[10px] font-medium ${
                                item.enabled ? 'text-green-600' : 'text-gray-400'
                              }`}
                            >
                              {item.enabled ? 'Available' : 'Disabled'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tax Configuration details */}
                <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100 flex items-center justify-between text-xs text-purple-900">
                  <span className="font-medium flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-[#7C3AED]" />
                    Tax ({menu.tax_type})
                  </span>
                  <span className="font-bold">{menu.tax_percentage}%</span>
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDrawer(menu)}
                  className="w-full text-xs gap-1.5 border-gray-200 text-gray-700 hover:bg-purple-50 hover:text-[#7C3AED]"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit Details & Items
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="p-4">Menu Name</th>
                  <th className="p-4">Branch</th>
                  <th className="p-4">Price List</th>
                  <th className="p-4">Total Items</th>
                  <th className="p-4">Tax Config</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredMenus.map((menu) => (
                  <tr key={menu.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-4 font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-4 h-4 text-[#7C3AED]" />
                        {menu.menu_name}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">{menu.branch}</td>
                    <td className="p-4 text-gray-600">{menu.price_list}</td>
                    <td className="p-4 text-gray-600">{menu.items.length} dishes</td>
                    <td className="p-4 text-gray-600">
                      {menu.tax_type} ({menu.tax_percentage}%)
                    </td>
                    <td className="p-4">
                      <Badge variant={menu.is_enabled ? 'success' : 'cancelled'}>
                        {menu.is_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDrawer(menu)}
                          className="h-8 px-2 text-gray-600 hover:text-[#7C3AED] hover:bg-purple-50"
                          title="Edit Menu"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateMenu(menu)}
                          className="h-8 px-2 text-gray-600 hover:text-[#7C3AED] hover:bg-purple-50"
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleMenuStatus(menu.id)}
                          className="h-8 px-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50"
                          title={menu.is_enabled ? 'Disable Menu' : 'Enable Menu'}
                        >
                          {menu.is_enabled ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMenu(menu.id)}
                          className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="Delete Menu"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Add/Edit Menu with 4 Sections */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingMenu ? 'Edit Menu' : 'Add New Menu'}
        subtitle="Configure menu details, repeatable dish items, operational flags, and tax rules."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveMenu}
              className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
            >
              Save Menu Configuration
            </Button>
          </>
        }
      >
        <div className="space-y-8">
          {/* Section 1: General */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Layers className="w-4 h-4 text-[#7C3AED]" />
              <h3 className="text-base font-bold text-gray-900">1. General Information</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Menu Name *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Main Dining Menu"
                  value={formMenuName}
                  onChange={(e) => setFormMenuName(e.target.value)}
                  className="w-full bg-white border-gray-200 focus:border-[#7C3AED]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Branch *</label>
                <select
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                >
                  {BRANCHES.filter((b) => b !== 'All Branches').map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Price List *
                </label>
                <select
                  value={formPriceList}
                  onChange={(e) => setFormPriceList(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                >
                  {PRICE_LISTS.map((pl) => (
                    <option key={pl} value={pl}>
                      {pl}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Menu Items (Repeatable Table) */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-[#7C3AED]" />
                <h3 className="text-base font-bold text-gray-900">2. Menu Items</h3>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddFormItem}
                className="gap-1.5 text-xs text-[#7C3AED] border-purple-200 hover:bg-purple-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase">
                    <th className="p-2.5">Item Name</th>
                    <th className="p-2.5">Course</th>
                    <th className="p-2.5 w-28">Price (₹)</th>
                    <th className="p-2.5 text-center w-24">Enabled</th>
                    <th className="p-2.5 text-center w-24">Special Dish</th>
                    <th className="p-2.5 text-right w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {formItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="p-2">
                        <Input
                          type="text"
                          placeholder="e.g. Butter Chicken"
                          value={item.name}
                          onChange={(e) =>
                            handleUpdateFormItem(item.id, { name: e.target.value })
                          }
                          className="h-8 text-xs bg-white border-gray-200"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={item.course}
                          onChange={(e) =>
                            handleUpdateFormItem(item.id, { course: e.target.value })
                          }
                          className="h-8 px-2 text-xs bg-white border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                        >
                          {COURSES.filter((c) => c !== 'All Courses').map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          value={item.price}
                          onChange={(e) =>
                            handleUpdateFormItem(item.id, {
                              price: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-8 text-xs bg-white border-gray-200"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) =>
                            handleUpdateFormItem(item.id, { enabled: e.target.checked })
                          }
                          className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.special_dish}
                          onChange={(e) =>
                            handleUpdateFormItem(item.id, { special_dish: e.target.checked })
                          }
                          className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveFormItem(item.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Remove Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Operations */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Sparkles className="w-4 h-4 text-[#7C3AED]" />
              <h3 className="text-base font-bold text-gray-900">3. Operational Flags</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 border border-gray-200 rounded-lg flex items-center justify-between bg-gray-50/50">
                <div>
                  <span className="text-xs font-semibold text-gray-900 block">Enable Menu</span>
                  <span className="text-[11px] text-gray-500">Make active in POS terminal</span>
                </div>
                <input
                  type="checkbox"
                  checked={formIsEnabled}
                  onChange={(e) => setFormIsEnabled(e.target.checked)}
                  className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                />
              </div>

              <div className="p-3 border border-gray-200 rounded-lg flex items-center justify-between bg-gray-50/50">
                <div>
                  <span className="text-xs font-semibold text-gray-900 block">
                    Disable Inactive Items
                  </span>
                  <span className="text-[11px] text-gray-500">Hide disabled items from POS</span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked={true}
                  className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                />
              </div>

              <div className="p-3 border border-gray-200 rounded-lg flex items-center justify-between bg-gray-50/50">
                <div>
                  <span className="text-xs font-semibold text-gray-900 block">
                    Highlight Special Dishes
                  </span>
                  <span className="text-[11px] text-gray-500">Show star badge on POS screen</span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked={true}
                  className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Tax Configuration */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Percent className="w-4 h-4 text-[#7C3AED]" />
              <h3 className="text-base font-bold text-gray-900">4. Tax Configuration</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tax Type</label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name="tax_type"
                      value="Exclusive"
                      checked={formTaxType === 'Exclusive'}
                      onChange={() => setFormTaxType('Exclusive')}
                      className="text-[#7C3AED] focus:ring-[#7C3AED]"
                    />
                    Exclusive (Tax added at checkout)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name="tax_type"
                      value="Inclusive"
                      checked={formTaxType === 'Inclusive'}
                      onChange={() => setFormTaxType('Inclusive')}
                      className="text-[#7C3AED] focus:ring-[#7C3AED]"
                    />
                    Inclusive (Tax included in item price)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tax Percentage (%) *
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={formTaxPercentage}
                  onChange={(e) => setFormTaxPercentage(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border-gray-200 focus:border-[#7C3AED]"
                />
                <p className="text-[11px] text-gray-500 mt-1">Default GST / Local Tax rate: 5.0%</p>
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
