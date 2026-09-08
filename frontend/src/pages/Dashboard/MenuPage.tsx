import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBranchContext } from '../../context/BranchContext';
import { Utensils, Search, Plus, LayoutGrid, List, Edit2, Check, X, Trash2 } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast, DataTable, type DataTableColumn } from '@ury/ui';
import { formatCurrency, call } from '@ury/core';
import { dashboardService } from '../../services/dashboard';
import SideDrawer from '../../components/layout/SideDrawer';
import { PageToolbar } from '../../components/layout/PageToolbar';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { MenuBulkUpload } from '../../components/common/MenuBulkUpload';

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

interface MenuItemRow {
  id: string;
  item: string;
  item_name: string;
  price: number | '';
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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Options for Branch and Price List selects
  const [branchOptions, setBranchOptions] = useState<{ name: string; title?: string }[]>([]);

  // Add/Edit item form state
  const [newItem, setNewItem] = useState({
    item_name: '',
    rate: '',
    course: '',
    image: '',
    image_name: '',
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
  const [returnToAddItemFromCourse, setReturnToAddItemFromCourse] = useState(false);

  // Add new menu item rows & global item options
  const [allItems, setAllItems] = useState<{ name: string; item_name: string; standard_rate?: number; custom_course?: string; image?: string }[]>([]);
  const [newMenuRows, setNewMenuRows] = useState<MenuItemRow[]>([]);
  const [creatingItemForRowIndex, setCreatingItemForRowIndex] = useState<number | null>(null);

  const createEmptyRow = (): MenuItemRow => ({
    id: `row-${Math.random().toString(36).substr(2, 9)}`,
    item: '',
    item_name: '',
    price: '',
  });

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
      if (menuName === 'all') {
        const allMenuDocs = await Promise.all(
          menus.map((m) =>
            call<any>('frappe.client.get', {
              doctype: 'URY Menu',
              name: m.name,
            })
              .then((res) => (res.message || res)?.items || [])
              .catch(() => [])
          )
        );
        setItems(allMenuDocs.flat());
      } else {
        const res = await call<any>('frappe.client.get', {
          doctype: 'URY Menu',
          name: menuName,
        });
        const menuDoc = res.message || res;
        setItems(menuDoc.items || []);
      }
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

  const fetchAllItems = async () => {
    try {
      const items = await dashboardService.getModuleRecords<{ name: string; item_name: string; standard_rate?: number; custom_course?: string; image?: string }>('Item', 'all');
      setAllItems(items || []);
    } catch {
      setAllItems([]);
    }
  };

  useEffect(() => {
    fetchMenus();
    fetchBranches();
    fetchAllItems();
  }, [activeBranchId]);

  useEffect(() => {
    if (selectedMenu) {
      fetchMenuItems(selectedMenu);
    }
  }, [selectedMenu, menus.length]);

  const openAddItemDrawer = () => {
    setEditingItem(null);
    setPreviewImageUrl(null);
    setNewItem({
      item_name: '',
      rate: '',
      course: '',
      image: '',
      image_name: '',
      new_course_name: '',
      is_adding_new_course: false,
      target_menu: selectedMenu === 'all' ? (menus[0]?.name || '') : selectedMenu,
    });
    setDrawerMode('add-item');
  };

  const openEditItemDrawer = (item: MenuItemRecord) => {
    setEditingItem(item);
    setPreviewImageUrl(null);
    const matchedItem = allItems.find(i => i.name === item.item);
    const initialImage = item.image || matchedItem?.image || '';
    let initialImageName = '';
    if (initialImage) {
      initialImageName = initialImage.split('/').pop()?.split('?')[0] || 'attached_image.png';
      if (initialImageName.startsWith('data:')) {
        initialImageName = 'image.png';
      }
    }

    setNewItem({
      item_name: item.item_name || '',
      rate: item.rate?.toString() || '',
      course: item.course || '',
      image: initialImage,
      image_name: initialImageName,
      new_course_name: '',
      is_adding_new_course: false,
      target_menu: selectedMenu === 'all' ? (menus[0]?.name || '') : selectedMenu,
    });
    setDrawerMode('edit-item');
  };

  const getItemImage = (item: MenuItemRecord): string | undefined => {
    if (item.image) return item.image;
    const matched = allItems.find(i => i.name === item.item);
    return matched?.image || undefined;
  };

  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  const extractFileUrl = (res: any): string | null => {
    if (!res) return null;
    if (typeof res === 'string' && (res.startsWith('/') || res.startsWith('http'))) return res;
    if (typeof res.file_url === 'string' && (res.file_url.startsWith('/') || res.file_url.startsWith('http'))) return res.file_url;
    if (res.message) {
      if (typeof res.message === 'string' && (res.message.startsWith('/') || res.message.startsWith('http'))) return res.message;
      if (typeof res.message.file_url === 'string' && (res.message.file_url.startsWith('/') || res.message.file_url.startsWith('http'))) return res.message.file_url;
      if (typeof res.message.name === 'string' && (res.message.name.startsWith('/') || res.message.name.startsWith('http'))) return res.message.name;
    }
    return null;
  };

  const uploadImageFile = async (file: File): Promise<string> => {
    // 1. Primary Method: Standard Frappe multipart/form-data upload using fetch
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      formData.append('filename', file.name);
      formData.append('file_name', file.name);
      formData.append('is_private', '0');

      const baseUrl = import.meta.env?.VITE_FRAPPE_BASE_URL || '';
      const uploadEndpoint = `${baseUrl}/api/method/upload_file`;

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const resJson = await response.json();
        const url = extractFileUrl(resJson);
        if (url) return url;
      }
    } catch (err) {
      console.warn('multipart FormData upload failed, falling back to call("upload_file")', err);
    }

    // 2. Fallback: call upload_file RPC using base64 with explicit file_name
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          reject(new Error('Failed to read image data'));
          return;
        }
        try {
          const base64Data = dataUrl.split(',')[1];
          const uploadRes = await call<any>('upload_file', {
            file_name: file.name,
            filename: file.name,
            filedata: base64Data,
            is_private: 0,
          });
          const url = extractFileUrl(uploadRes);
          if (url) {
            resolve(url);
          } else {
            reject(new Error('Upload response did not contain a valid file URL'));
          }
        } catch (err: any) {
          reject(err);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast.error('Image size must be under 5MB');
      return;
    }

    setUploadingImage(true);
    try {
      const fileUrl = await uploadImageFile(file);
      setNewItem(prev => ({
        ...prev,
        image: fileUrl,
        image_name: file.name,
      }));
      showToast.success('Image uploaded successfully');
    } catch (err: any) {
      console.error('Failed to upload image', err);
      showToast.error(`Failed to upload image: ${err.message || 'Server error'}`);
      e.target.value = '';
    } finally {
      setUploadingImage(false);
    }
  };

  const openAddMenuDrawer = () => {
    setNewMenu({
      menu_name: '',
      branch: activeBranchId !== 'all' ? activeBranchId : '',
      price_list: '',
    });
    setNewMenuRows([createEmptyRow()]);
    setCreatingItemForRowIndex(null);
    setDrawerMode('add-menu');
  };

  const openAddCourseDrawer = (fromAddItem = false) => {
    setNewCourseName('');
    setNewCourseIcon('');
    setReturnToAddItemFromCourse(fromAddItem);
    setDrawerMode('add-course');
  };

  const closeDrawer = () => {
    setPreviewImageUrl(null);
    if (returnToAddItemFromCourse) {
      setReturnToAddItemFromCourse(false);
      setDrawerMode('add-item');
    } else if (creatingItemForRowIndex !== null) {
      setCreatingItemForRowIndex(null);
      setDrawerMode('add-menu');
    } else {
      setDrawerMode('none');
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.item_name || !newItem.rate) return;
    if (creatingItemForRowIndex === null && !newItem.target_menu) return;

    // Ensure image is a valid URL and not raw base64 data
    const sanitizedImage = newItem.image ? newItem.image.trim() : '';
    if (sanitizedImage.startsWith('data:') || sanitizedImage.startsWith('blob:')) {
      showToast.error('Invalid image data. Please upload the image again.');
      return;
    }

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
        menuDoc.items[rowIndex].image = sanitizedImage || undefined;
        await call('frappe.client.save', { doc: menuDoc });

        if (editingItem.item) {
          try {
            await call('frappe.client.set_value', {
              doctype: 'Item',
              name: editingItem.item,
              fieldname: {
                image: sanitizedImage,
                custom_course: resolvedCourse,
                standard_rate: parseFloat(newItem.rate),
              },
            });
          } catch (err) {
            console.error('Failed to update Item doc image', err);
          }
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
            image: sanitizedImage || undefined,
          },
        });
        const createdItem = insertRes.message || insertRes;

        await fetchAllItems();

        if (creatingItemForRowIndex !== null) {
          const updatedRows = [...newMenuRows];
          updatedRows[creatingItemForRowIndex] = {
            ...updatedRows[creatingItemForRowIndex],
            item: createdItem.name,
            item_name: newItem.item_name,
            price: parseFloat(newItem.rate) || 0,
          };
          setNewMenuRows(updatedRows);
          
          setCreatingItemForRowIndex(null);
          setDrawerMode('add-menu');
        } else {
          const res = await call<any>('frappe.client.get', { doctype: 'URY Menu', name: newItem.target_menu });
          const menuDoc = res.message || res;
          if (!menuDoc.items) menuDoc.items = [];
          menuDoc.items.push({
            item: createdItem.name,
            item_name: newItem.item_name,
            course: resolvedCourse,
            rate: parseFloat(newItem.rate),
            image: sanitizedImage || undefined,
          });
          await call('frappe.client.save', { doc: menuDoc });
        }
      }

      // Refresh both allItems and menu items so list view updates immediately with new/replaced/removed image
      await Promise.all([
        fetchAllItems(),
        creatingItemForRowIndex === null ? fetchMenuItems(selectedMenu) : Promise.resolve(),
      ]);

      showToast.success('Item saved');
      if (creatingItemForRowIndex === null) {
        closeDrawer();
      }
    } catch (err) {
      console.error('Failed to save Item', err);
      showToast.error('Failed to save item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenu.menu_name || !newMenu.branch) {
      showToast.error('Menu Name and Branch are required fields');
      return;
    }

    const validRows = newMenuRows.filter(r => r.item);
    if (validRows.length === 0) {
      showToast.error('Please add at least one item to the menu');
      return;
    }

    setSavingMenu(true);
    try {
      const itemsPayload = validRows.map(row => {
        const matchedItem = allItems.find(i => i.name === row.item);
        return {
          item: row.item,
          item_name: row.item_name || (matchedItem ? matchedItem.item_name : ''),
          rate: parseFloat(row.price as any) || 0,
          course: matchedItem?.custom_course || undefined,
        };
      });

      const createdMenuName = newMenu.menu_name;
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Menu',
          name: createdMenuName,
          menu_name: createdMenuName,
          branch: newMenu.branch,
          items: itemsPayload,
        },
      });
      await fetchMenus();
      setSelectedMenu(createdMenuName);
      showToast.success('Menu saved');
      closeDrawer();
    } catch (err) {
      console.error('Failed to create URY Menu', err);
      showToast.error('Failed to save menu');
    } finally {
      setSavingMenu(false);
    }
  };

  const handleBulkUploadParsed = async (parsedRows: { name: string; course: string; price: number }[]) => {
    showToast.info('Processing uploaded items...');
    const resolvedRows: MenuItemRow[] = [];
    let updatedAllItems = [...allItems];
    let createdCount = 0;
    
    try {
      for (const row of parsedRows) {
        if (!row.name) continue;
        
        const isDuplicateInSelection = resolvedRows.some(r => r.item_name.toLowerCase() === row.name.toLowerCase());
        if (isDuplicateInSelection) continue;

        const isDuplicateInForm = newMenuRows.some(r => r.item_name.toLowerCase() === row.name.toLowerCase());
        if (isDuplicateInForm) continue;

        let matched = updatedAllItems.find(i => i.name.toLowerCase() === row.name.toLowerCase() || i.item_name.toLowerCase() === row.name.toLowerCase());
        
        let itemCode = '';
        let itemName = '';
        
        if (matched) {
          itemCode = matched.name;
          itemName = matched.item_name || matched.name;
        } else {
          let resolvedCourse = row.course;
          if (resolvedCourse) {
            const courseExists = availableCourses.some(c => c.name.toLowerCase() === resolvedCourse.toLowerCase());
            if (!courseExists) {
              try {
                await call('frappe.client.insert', {
                  doc: {
                    doctype: 'URY Menu Course',
                    course: resolvedCourse,
                  },
                });
                await fetchCourses();
              } catch (err) {
                console.error('Failed to create course', err);
              }
            }
          }

          const insertRes = await call<any>('frappe.client.insert', {
            doc: {
              doctype: 'Item',
              item_code: row.name,
              item_name: row.name,
              item_group: 'All Item Groups',
              stock_uom: 'Nos',
              standard_rate: row.price || 0,
              is_sales_item: 1,
              is_stock_item: 0,
              custom_course: resolvedCourse || undefined,
            },
          });
          const createdItem = insertRes.message || insertRes;
          itemCode = createdItem.name;
          itemName = createdItem.item_name || row.name;
          
          updatedAllItems.push({
            name: itemCode,
            item_name: itemName,
            standard_rate: row.price,
            custom_course: resolvedCourse,
          });
          createdCount++;
        }
        
        resolvedRows.push({
          id: `row-${Math.random().toString(36).substr(2, 9)}`,
          item: itemCode,
          item_name: itemName,
          price: row.price || '',
        });
      }

      await fetchAllItems();

      const cleanedInitialRows = newMenuRows.filter(r => r.item);
      setNewMenuRows([...cleanedInitialRows, ...resolvedRows]);
      
      if (createdCount > 0) {
        showToast.success(`Successfully processed ${parsedRows.length} items (${createdCount} new items created).`);
      } else {
        showToast.success(`Successfully processed ${parsedRows.length} items.`);
      }
    } catch (err) {
      console.error('Error processing bulk upload', err);
      showToast.error('Failed to process some uploaded items');
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    const createdCourse = newCourseName.trim();
    setSavingCourse(true);
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Menu Course',
          course: createdCourse,
          icon: newCourseIcon || undefined,
        },
      });
      await fetchCourses();
      showToast.success('Course saved');
      if (returnToAddItemFromCourse) {
        setNewItem(prev => ({ ...prev, course: createdCourse }));
        setReturnToAddItemFromCourse(false);
        setDrawerMode('add-item');
      } else {
        closeDrawer();
      }
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

  const categories = Array.from(
    new Set([
      ...availableCourses.map((c) => c.name),
      ...(items.map((i) => i.course).filter(Boolean) as string[])
    ])
  );


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
              options={[
                { value: 'all', label: 'All Menu Items' },
                ...menus.map((m) => ({ value: m.name, label: m.menu_name || m.name }))
              ]}
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
            onClick={() => openAddCourseDrawer(false)}
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
        <Card padding="none" className="py-24 flex items-center justify-center rounded-xl">
          <Spinner className="w-8 h-8 text-primary" />
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card padding="none" className="p-16 flex flex-col items-center justify-center text-center rounded-xl">
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
                {getItemImage(item) ? (
                  <img
                    src={getItemImage(item)}
                    alt={item.item_name}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewImageUrl(getItemImage(item) || null)}
                    title="Click to preview image"
                  />
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
        <>
          {(() => {
            const itemColumns: DataTableColumn<MenuItemRecord>[] = [
              {
                key: 'item_name',
                header: 'Item Name',
                render: (item) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
                      {getItemImage(item) ? (
                        <img
                          src={getItemImage(item)}
                          alt={item.item_name}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImageUrl(getItemImage(item) || null)}
                          title="Click to preview image"
                        />
                      ) : (
                        <Utensils className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    {item.item_name}
                  </div>
                ),
              },
              {
                key: 'course',
                header: 'Course',
                render: (item) => (
                  <Badge variant="outline" className="border-border bg-muted text-muted-foreground text-xs font-medium">
                    {item.course || 'None'}
                  </Badge>
                ),
              },
              {
                key: 'rate',
                header: 'Standard Rate',
                align: 'right',
                render: (item) => <span className="font-bold text-primary">{formatCurrency(item.rate || 0)}</span>,
              },
              {
                key: 'special_dish',
                header: 'Special',
                render: (item) => (
                  <div className="flex justify-center">
                    {item.special_dish ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                  </div>
                ),
              },
              {
                key: 'disabled',
                header: 'Disabled',
                render: (item) => (
                  <div className="flex justify-center">
                    {item.disabled ? <Check className="w-4 h-4 text-red-500" /> : <X className="w-4 h-4 text-gray-300" />}
                  </div>
                ),
              },
              {
                key: 'name',
                header: 'Actions',
                align: 'right',
                render: (item) => (
                  <Button variant="ghost" size="sm" onClick={() => openEditItemDrawer(item)} className="text-gray-500 hover:text-primary">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                ),
              },
            ];

            return <DataTable columns={itemColumns} rows={filteredItems} isLoading={loading} emptyMessage="No items found." />;
          })()}
        </>
      )}

      {/* Add/Edit Item Drawer */}
      <SideDrawer
        isOpen={drawerMode === 'add-item' || drawerMode === 'edit-item'}
        onClose={closeDrawer}
        title={drawerTitle}
      >
        <form onSubmit={handleSaveItem} className="space-y-5 text-sm">
          {creatingItemForRowIndex === null && (
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Target Menu <span className="text-red-500">*</span></label>
              <SearchableSelect
                id="target_menu"
                value={newItem.target_menu}
                onChange={(_, value) => setNewItem({ ...newItem, target_menu: value })}
                options={menus.map(m => ({ value: m.name, label: m.menu_name || m.name }))}
              />
            </div>
          )}

          {/* Item Name & Upload Image Row */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block font-semibold text-foreground mb-1.5">
                Item Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={newItem.item_name}
                onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                required
                className="font-medium w-full"
              />
            </div>

            <div className="shrink-0 h-10 flex items-center">
              {newItem.image ? (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted border border-border rounded-md text-xs font-medium text-foreground max-w-[170px]"
                >
                  <span
                    className="truncate font-medium text-foreground select-none"
                    title={newItem.image_name || newItem.image}
                  >
                    {newItem.image_name || (newItem.image.split('/').pop()?.split('?')[0] || 'attached_image.png')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewItem(prev => ({ ...prev, image: '', image_name: '' }))}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 transition-colors shrink-0"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-primary cursor-pointer transition-colors rounded-md hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/20 shrink-0 group ${uploadingImage ? 'pointer-events-none opacity-60' : ''}`}
                  title="Upload Image"
                >
                  <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                  {uploadingImage ? (
                    <Spinner className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-paperclip-icon lucide-paperclip text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                    >
                      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
                    </svg>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={handleImageFileChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Course field */}
          <div>
            <label className="block font-semibold text-foreground mb-1.5">Course</label>
            <SearchableSelect
              id="course"
              value={newItem.course}
              onChange={(_, value) => {
                if (value === 'CREATE_NEW_COURSE') {
                  openAddCourseDrawer(true);
                } else {
                  setNewItem({ ...newItem, course: value });
                }
              }}
              options={[
                { value: '', label: 'None' },
                ...availableCourses.map(c => ({ value: c.name, label: c.name })),
                { value: 'CREATE_NEW_COURSE', label: '+ Create New Course' }
              ]}
            />
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
            <label className="block font-semibold text-foreground mb-1.5">Branch <span className="text-red-500">*</span></label>
            <SearchableSelect
              id="branch"
              value={newMenu.branch}
              onChange={(_, value) => setNewMenu({ ...newMenu, branch: value })}
              options={branchOptions.map(b => ({ value: b.name, label: b.title || b.name }))}
              placeholder="Select Branch..."
            />
          </div>

          {/* Menu Items Section */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col">
              <label className="block font-semibold text-foreground text-sm">
                Menu Items <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-muted-foreground mt-0.5">
                Add items and set custom price for this menu
              </span>
            </div>

            <div className="space-y-3">
              {/* Header Row */}
              <div className="flex gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="flex-[3]">Item</div>
                <div className="flex-[1.5]">Price (₹)</div>
                {newMenuRows.length > 1 && <div className="w-9 shrink-0"></div>}
              </div>

              {newMenuRows.map((row, index) => {
                const options = [
                  ...allItems.map(i => ({ value: i.name, label: i.item_name || i.name })),
                  { value: 'CREATE_NEW_ITEM', label: '+ Create New Item' }
                ];

                return (
                  <div key={row.id} className="flex items-center gap-3 relative" style={{ zIndex: 50 - index }}>
                    <div className="flex-[3]">
                      <SearchableSelect
                        id={`row-item-${index}`}
                        value={row.item}
                        options={options}
                        placeholder="Select Item..."
                        onChange={(_, value) => {
                          if (value === 'CREATE_NEW_ITEM') {
                            setCreatingItemForRowIndex(index);
                            setNewItem({
                              item_name: '',
                              rate: '',
                              course: '',
                              image: '',
                              image_name: '',
                              new_course_name: '',
                              is_adding_new_course: false,
                              target_menu: '',
                            });
                            setDrawerMode('add-item');
                          } else {
                            const isDup = newMenuRows.some((r, rIdx) => r.item === value && rIdx !== index);
                            if (isDup) {
                              showToast.error("This item is already added to this menu");
                              return;
                            }
                            
                            const selectedItem = allItems.find(i => i.name === value);
                            const updatedRows = [...newMenuRows];
                            updatedRows[index] = {
                              ...updatedRows[index],
                              item: value,
                              item_name: selectedItem ? selectedItem.item_name : '',
                              price: selectedItem?.standard_rate || '',
                            };
                            setNewMenuRows(updatedRows);
                          }
                        }}
                      />
                    </div>

                    <div className="flex-[1.5]">
                      <Input
                        type="number"
                        min={0}
                        value={row.price}
                        placeholder="0.00"
                        onChange={(e) => {
                          const updatedRows = [...newMenuRows];
                          updatedRows[index] = {
                            ...updatedRows[index],
                            price: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                          };
                          setNewMenuRows(updatedRows);
                        }}
                        required
                        className="w-full text-sm bg-background"
                      />
                    </div>

                    {newMenuRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setNewMenuRows(newMenuRows.filter((_, idx) => idx !== index));
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 h-auto shrink-0"
                        title="Delete Row"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setNewMenuRows([...newMenuRows, createEmptyRow()])}
              className="w-full py-2 border-dashed border-primary text-primary hover:bg-primary/5 flex items-center justify-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item</span>
            </Button>
          </div>

          {/* Bulk Upload Section */}
          <div className="pt-4 border-t border-border">
            <MenuBulkUpload
              onItemsParsed={handleBulkUploadParsed}
              title="Bulk Upload (Optional)"
              subtitle="Import items from a CSV file"
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-border">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold" disabled={savingMenu}>Cancel</Button>
            <Button type="submit" disabled={savingMenu} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs flex items-center gap-2">
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
            <SearchableSelect
              id="course-icon"
              value={newCourseIcon}
              onChange={(_, value) => setNewCourseIcon(value)}
              placeholder="Select Icon..."
              options={[
                { value: '', label: 'None' },
                { value: 'Utensils', label: 'Utensils' },
                { value: 'Coffee', label: 'Coffee' },
                { value: 'IceCream', label: 'Ice Cream' },
                { value: 'Salad', label: 'Salad' },
                { value: 'Pizza', label: 'Pizza' },
                { value: 'Beef', label: 'Beef' },
                { value: 'Fish', label: 'Fish' },
                { value: 'Wine', label: 'Wine' },
                { value: 'Soup', label: 'Soup' },
                { value: 'Sandwich', label: 'Sandwich' },
              ]}
            />
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-8 border-border">
            <Button type="button" variant="outline" onClick={closeDrawer} className="font-semibold" disabled={savingCourse}>Cancel</Button>
            <Button type="submit" disabled={savingCourse} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs flex items-center gap-2">
              Create Course
            </Button>
          </div>
        </form>
      </SideDrawer>

      {/* Reusable Image Preview Modal */}
      {previewImageUrl && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors shadow-md z-10 cursor-pointer"
              title="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImageUrl}
              alt="Image Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl select-none"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MenuPage;
