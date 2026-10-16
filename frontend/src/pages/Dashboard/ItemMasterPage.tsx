import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Package,
  Plus,
  Search,
  List,
  Grid,
  Edit2,
  Trash2,
  RefreshCw,
  Upload,
  X,
  Eye,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Input,
  Textarea,
  Spinner,
  showToast,
  DataTable,
  type DataTableColumn,
  ConfirmDialog,
  messageToPlainText
} from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import { useCurrency } from '../../context/CurrencyContext';
import { formatCurrency, call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';
import { PageToolbar } from '../../components/layout/PageToolbar';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { DeskLink } from '../../components/DeskLink';

export interface ItemRecord {
  name: string;
  item_code: string;
  item_name: string;
  item_group?: string;
  stock_uom?: string;
  standard_rate?: number;
  is_sales_item?: number;
  is_stock_item?: number;
  is_purchase_item?: number;
  include_item_in_manufacturing?: number;
  is_disposable?: number;
  disabled?: number;
  image?: string;
  description?: string;
  opening_stock?: number;
  valuation_rate?: number;
  modified?: string;
}

export interface ItemFormData {
  item_code: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  standard_rate: string;
  is_sales_item: boolean;
  is_stock_item: boolean;
  is_purchase_item: boolean;
  include_item_in_manufacturing: boolean;
  is_disposable: boolean;
  disabled: boolean;
  image: string;
  image_name: string;
  description: string;
  opening_stock: string;
  valuation_rate: string;
}

const DEFAULT_FORM_DATA: ItemFormData = {
  item_code: '',
  item_name: '',
  item_group: 'All Item Groups',
  stock_uom: 'Nos',
  standard_rate: '0',
  is_sales_item: true,
  is_stock_item: false,
  is_purchase_item: false,
  include_item_in_manufacturing: false,
  is_disposable: false,
  disabled: false,
  image: '',
  image_name: '',
  description: '',
  opening_stock: '0',
  valuation_rate: '0',
};

const ITEM_FIELDS = [
  'name',
  'item_code',
  'item_name',
  'item_group',
  'stock_uom',
  'standard_rate',
  'is_sales_item',
  'is_stock_item',
  'is_purchase_item',
  'include_item_in_manufacturing',
  'is_disposable',
  'disabled',
  'image',
  'description',
  'opening_stock',
  'valuation_rate',
  'modified',
];

export const ItemMasterPage: React.FC = () => {
  const { symbol: currencySymbol } = useCurrency();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters & View Mode
  const [search, setSearch] = useState<string>('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Lookups
  const [itemGroups, setItemGroups] = useState<{ name: string }[]>([]);
  const [uoms, setUoms] = useState<{ name: string }[]>([]);

  // Drawer & Form State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [formData, setFormData] = useState<ItemFormData>(DEFAULT_FORM_DATA);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  // Delete State
  const [itemToDelete, setItemToDelete] = useState<ItemRecord | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Image Preview Lightbox
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const fetchLookups = async () => {
    try {
      const [groupsRes, uomsRes] = await Promise.all([
        call<any>('frappe.client.get_list', {
          doctype: 'Item Group',
          fields: ['name'],
          limit_page_length: 500,
          order_by: 'name asc',
        }),
        call<any>('frappe.client.get_list', {
          doctype: 'UOM',
          fields: ['name'],
          limit_page_length: 500,
          order_by: 'name asc',
        }),
      ]);

      const groups = Array.isArray(groupsRes?.message)
        ? groupsRes.message
        : Array.isArray(groupsRes)
        ? groupsRes
        : [];
      const uomList = Array.isArray(uomsRes?.message)
        ? uomsRes.message
        : Array.isArray(uomsRes)
        ? uomsRes
        : [];

      setItemGroups(groups);
      setUoms(uomList);
    } catch (err) {
      console.error('Failed to fetch item lookups', err);
    }
  };

  const fetchItems = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Item',
        fields: ITEM_FIELDS,
        order_by: 'modified desc',
        limit_page_length: 1000,
      });

      const list = Array.isArray(res?.message)
        ? res.message
        : Array.isArray(res)
        ? res
        : [];
      setItems(list);
    } catch (err: any) {
      console.error('Failed to fetch items', err);
      showToast.error(err?.message || 'Failed to load items from ERPNext');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLookups();
    fetchItems();
  }, []);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search filter (Item Name or Item Code)
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesName = (item.item_name || '').toLowerCase().includes(query);
        const matchesCode = (item.item_code || item.name || '').toLowerCase().includes(query);
        const matchesGroup = (item.item_group || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesGroup) return false;
      }

      // Group filter
      if (groupFilter !== 'all' && item.item_group !== groupFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active' && item.disabled) return false;
      if (statusFilter === 'disabled' && !item.disabled) return false;
      if (statusFilter === 'stock' && !item.is_stock_item) return false;
      if (statusFilter === 'sales' && !item.is_sales_item) return false;
      if (statusFilter === 'purchase' && !item.is_purchase_item) return false;
      if (statusFilter === 'mfg' && !item.include_item_in_manufacturing) return false;

      return true;
    });
  }, [items, search, groupFilter, statusFilter]);

  // Open Add Drawer
  const openAddDrawer = () => {
    setEditingItem(null);
    setCodeManuallyEdited(false);
    const defaultGroup = itemGroups.length > 0
      ? (itemGroups.find(g => g.name === 'All Item Groups')?.name || itemGroups[0].name)
      : 'All Item Groups';
    const defaultUom = uoms.length > 0
      ? (uoms.find(u => u.name === 'Nos')?.name || uoms[0].name)
      : 'Nos';

    setFormData({
      ...DEFAULT_FORM_DATA,
      item_group: defaultGroup,
      stock_uom: defaultUom,
    });
    setIsDrawerOpen(true);
  };

  // Open Edit Drawer
  const openEditDrawer = (item: ItemRecord) => {
    setEditingItem(item);
    setCodeManuallyEdited(true);

    let initialImageName = '';
    if (item.image) {
      initialImageName = item.image.split('/').pop()?.split('?')[0] || 'attached_image.png';
      if (initialImageName.startsWith('data:')) {
        initialImageName = 'image.png';
      }
    }

    setFormData({
      item_code: item.item_code || item.name,
      item_name: item.item_name || item.name,
      item_group: item.item_group || 'All Item Groups',
      stock_uom: item.stock_uom || 'Nos',
      standard_rate: item.standard_rate !== undefined ? String(item.standard_rate) : '0',
      is_sales_item: item.is_sales_item === 1 || item.is_sales_item === undefined,
      is_stock_item: item.is_stock_item === 1,
      is_purchase_item: item.is_purchase_item === 1,
      include_item_in_manufacturing: item.include_item_in_manufacturing === 1,
      is_disposable: item.is_disposable === 1,
      disabled: item.disabled === 1,
      image: item.image || '',
      image_name: initialImageName,
      description: item.description || '',
      opening_stock: item.opening_stock !== undefined ? String(item.opening_stock) : '0',
      valuation_rate: item.valuation_rate !== undefined ? String(item.valuation_rate) : '0',
    });
    setIsDrawerOpen(true);
  };

  // Handle Item Name change with smart auto-filling of item_code
  const handleItemNameChange = (nameVal: string) => {
    if (!editingItem && !codeManuallyEdited) {
      setFormData(prev => ({
        ...prev,
        item_name: nameVal,
        item_code: nameVal,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        item_name: nameVal,
      }));
    }
  };

  // Image Upload Handler
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
    // 1. Standard Frappe multipart/form-data upload
    try {
      const formPayload = new FormData();
      formPayload.append('file', file, file.name);
      formPayload.append('filename', file.name);
      formPayload.append('file_name', file.name);
      formPayload.append('is_private', '0');

      const baseUrl = import.meta.env?.VITE_FRAPPE_BASE_URL || '';
      const uploadEndpoint = `${baseUrl}/api/method/upload_file`;

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formPayload,
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
      console.warn('multipart upload failed, trying upload_file RPC', err);
    }

    // 2. Base64 RPC fallback
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
      setFormData(prev => ({
        ...prev,
        image: fileUrl,
        image_name: file.name,
      }));
      showToast.success('Image uploaded successfully');
    } catch (err: any) {
      console.error('Failed to upload image', err);
      showToast.error(`Failed to upload image: ${err?.message || 'Server error'}`);
      e.target.value = '';
    } finally {
      setUploadingImage(false);
    }
  };

  // Save Item (Create or Edit)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanItemName = formData.item_name.trim();
    const cleanItemCode = formData.item_code.trim();

    if (!cleanItemName) {
      showToast.error('Item Name is required');
      return;
    }
    if (!cleanItemCode) {
      showToast.error('Item Code is required');
      return;
    }
    if (!formData.item_group) {
      showToast.error('Item Group is required');
      return;
    }
    if (!formData.stock_uom) {
      showToast.error('Stock UOM is required');
      return;
    }

    setSaving(true);
    try {
      const sanitizedImage = formData.image ? formData.image.trim() : '';

      const commonFields: Record<string, any> = {
        item_name: cleanItemName,
        item_group: formData.item_group,
        stock_uom: formData.stock_uom,
        standard_rate: parseFloat(formData.standard_rate) || 0,
        is_sales_item: formData.is_sales_item ? 1 : 0,
        is_stock_item: formData.is_stock_item ? 1 : 0,
        is_purchase_item: formData.is_purchase_item ? 1 : 0,
        include_item_in_manufacturing: formData.include_item_in_manufacturing ? 1 : 0,
        is_disposable: formData.is_disposable ? 1 : 0,
        disabled: formData.disabled ? 1 : 0,
        image: sanitizedImage || undefined,
        description: formData.description.trim() || undefined,
      };

      if (formData.is_stock_item) {
        commonFields.opening_stock = parseFloat(formData.opening_stock) || 0;
        commonFields.valuation_rate = parseFloat(formData.valuation_rate) || 0;
      }

      if (editingItem) {
        let currentItemName = editingItem.name;

        // If item_code was modified, rename doc
        if (cleanItemCode !== editingItem.item_code && cleanItemCode !== editingItem.name) {
          await call('frappe.client.rename_doc', {
            doctype: 'Item',
            old_name: editingItem.name,
            new_name: cleanItemCode,
          });
          currentItemName = cleanItemCode;
        }

        await call('frappe.client.set_value', {
          doctype: 'Item',
          name: currentItemName,
          fieldname: commonFields,
        });

        showToast.success('Item updated successfully');
      } else {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'Item',
            item_code: cleanItemCode,
            ...commonFields,
          },
        });

        showToast.success('Item created successfully in ERPNext');
      }

      setIsDrawerOpen(false);
      await fetchItems();
    } catch (err: any) {
      console.error('Failed to save Item', err);
      let errorMsg = 'Failed to save item';
      if (err?._server_messages) {
        try {
          const messages = JSON.parse(err._server_messages);
          if (messages.length > 0) {
            const lastMsg = JSON.parse(messages[messages.length - 1]);
            if (lastMsg.message) {
              errorMsg = messageToPlainText(lastMsg.message);
            }
          }
        } catch (e) {}
      } else if (err?.message) {
        errorMsg = err.message;
      }
      showToast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Delete Prompt
  const openDeleteDialog = (item: ItemRecord) => {
    setItemToDelete(item);
    setIsDeleteDialogOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      await call('frappe.client.delete', {
        doctype: 'Item',
        name: itemToDelete.name,
      });

      showToast.success(`Item "${itemToDelete.item_name || itemToDelete.name}" deleted successfully`);
      setIsDeleteDialogOpen(false);
      if (isDrawerOpen && editingItem?.name === itemToDelete.name) {
        setIsDrawerOpen(false);
      }
      setItemToDelete(null);
      await fetchItems();
    } catch (err: any) {
      console.error('Failed to delete Item', err);
      let errorMsg = 'Failed to delete item';
      if (err?._server_messages) {
        try {
          const messages = JSON.parse(err._server_messages);
          if (messages.length > 0) {
            const lastMsg = JSON.parse(messages[messages.length - 1]);
            if (lastMsg.message) {
              errorMsg = messageToPlainText(lastMsg.message);
            }
          }
        } catch (e) {}
      } else if (err?.message) {
        errorMsg = err.message;
      }

      showToast.error(
        `${errorMsg}. If this item is linked to existing transactions in ERPNext, deactivate it by toggling Disabled instead.`
      );
    } finally {
      setDeleting(false);
    }
  };

  // Quick toggle disabled status
  const handleToggleDisabled = async (item: ItemRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = item.disabled ? 0 : 1;

    // Optimistic local update
    setItems(prev =>
      prev.map(i => (i.name === item.name ? { ...i, disabled: newStatus } : i))
    );

    try {
      await call('frappe.client.set_value', {
        doctype: 'Item',
        name: item.name,
        fieldname: 'disabled',
        value: newStatus,
      });
      showToast.success(
        `Item "${item.item_name}" ${newStatus ? 'disabled' : 'enabled'}`
      );
    } catch (err: any) {
      console.error('Failed to update status', err);
      showToast.error(err?.message || 'Failed to update item status');
      // Revert on failure
      fetchItems();
    }
  };

  // DataTable Columns
  const columns: DataTableColumn<ItemRecord>[] = [
    {
      key: 'item_name',
      header: 'Item',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-hair cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all"
            onClick={(e) => {
              if (item.image) {
                e.stopPropagation();
                setPreviewImageUrl(item.image);
              }
            }}
            title={item.image ? 'Click to preview' : 'No image'}
          >
            {item.image ? (
              <img
                src={item.image}
                alt={item.item_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="w-4 h-4 text-muted-foreground/60" />
            )}
          </div>
          <div className="min-w-0">
            <button
              onClick={() => openEditDrawer(item)}
              className="font-medium text-foreground hover:text-primary text-left truncate block transition-colors max-w-xs"
              title={item.item_name}
            >
              {item.item_name}
            </button>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono">{item.item_code || item.name}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'item_group',
      header: 'Group',
      render: (item) => (
        <Badge
          variant="outline"
          className="border-hair bg-muted/60 text-muted-foreground text-xs font-normal"
        >
          {item.item_group || 'All Item Groups'}
        </Badge>
      ),
    },
    {
      key: 'stock_uom',
      header: 'UOM',
      render: (item) => (
        <span className="text-xs text-muted-foreground font-medium">
          {item.stock_uom || 'Nos'}
        </span>
      ),
    },
    {
      key: 'standard_rate',
      header: 'Rate',
      align: 'right',
      render: (item) => (
        <span className="font-semibold text-foreground tabular-nums text-sm">
          {formatCurrency(item.standard_rate || 0)}
        </span>
      ),
    },
    {
      key: 'is_sales_item',
      header: 'Features',
      render: (item) => (
        <div className="flex items-center gap-1 flex-wrap">
          {item.is_sales_item ? (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/20 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400">
              Sales
            </Badge>
          ) : null}
          {item.is_stock_item ? (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-blue-500/20 text-blue-600 bg-blue-500/10 dark:text-blue-400">
              Stock
            </Badge>
          ) : null}
          {item.include_item_in_manufacturing ? (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-purple-500/20 text-purple-600 bg-purple-500/10 dark:text-purple-400">
              Mfg
            </Badge>
          ) : null}
          {item.is_disposable ? (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/20 text-amber-600 bg-amber-500/10 dark:text-amber-400">
              Disposable
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'disabled',
      header: 'Status',
      render: (item) => (
        <button
          onClick={(e) => handleToggleDisabled(item, e)}
          className="inline-flex items-center cursor-pointer group"
          title={item.disabled ? 'Click to Enable' : 'Click to Disable'}
        >
          {item.disabled ? (
            <Badge variant="destructive" className="text-[11px] py-0.5 px-2 font-medium">
              Disabled
            </Badge>
          ) : (
            <Badge variant="tagSuccess" className="text-[11px] py-0.5 px-2 font-medium">
              Active
            </Badge>
          )}
        </button>
      ),
    },
    {
      key: 'name',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <DeskLink doctype="Item" name={item.name} iconOnly />
          <button
            onClick={() => openEditDrawer(item)}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-hair rounded-md transition-colors"
            title="Edit Item"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openDeleteDialog(item)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete Item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Partition-Style PageToolbar */}
      <PageToolbar className="flex-col md:flex-row justify-between gap-3">
        {/* Left Side: View Toggle, Search, Group Filter */}
        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
          {/* View Mode Toggle */}
          <div className="flex bg-muted rounded-lg p-1 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                viewMode === 'list'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                viewMode === 'grid'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search items or codes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 h-9 text-xs w-full bg-card"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Item Group Filter */}
          <div className="w-44">
            <SearchableSelect
              id="group-filter"
              value={groupFilter}
              onChange={(_, val) => setGroupFilter(val)}
              options={[
                { value: 'all', label: 'All Groups' },
                ...itemGroups.map((g) => ({ value: g.name, label: g.name })),
              ]}
              placeholder="All Groups"
            />
          </div>

          {/* Status Filter */}
          <div className="w-36">
            <SearchableSelect
              id="status-filter"
              value={statusFilter}
              onChange={(_, val) => setStatusFilter(val)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active Only' },
                { value: 'disabled', label: 'Disabled Only' },
                { value: 'sales', label: 'Sales Items' },
                { value: 'stock', label: 'Stock Items' },
                { value: 'purchase', label: 'Purchase Items' },
                { value: 'mfg', label: 'Manufacturing' },
              ]}
              placeholder="All Status"
            />
          </div>
        </div>

        {/* Right Side: Refresh & Add Item */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <Badge
            variant="outline"
            className="h-8 px-2.5 border-hair bg-muted text-muted-foreground text-xs font-medium shrink-0"
          >
            {filteredItems.length} {filteredItems.length === 1 ? 'Item' : 'Items'}
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchItems(true)}
            disabled={refreshing || loading}
            className="h-9 px-2.5"
            title="Sync with ERPNext"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs whitespace-nowrap h-9 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </Button>
        </div>
      </PageToolbar>

      {/* Content Area */}
      {loading ? (
        <Card padding="none" className="py-24 flex items-center justify-center rounded-xl border border-hair">
          <Spinner className="w-8 h-8 text-primary" />
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card padding="none" className="p-16 flex flex-col items-center justify-center text-center rounded-xl border border-hair">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">No Items Found</h3>
          <p className="text-muted-foreground mb-8 max-w-sm text-sm">
            {search || groupFilter !== 'all' || statusFilter !== 'all'
              ? 'No items match your selected filters. Try resetting the filters or search term.'
              : 'No items found. Create your first item to start organizing your menu and POS!'}
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs px-6"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </Button>
        </Card>
      ) : viewMode === 'grid' ? (
        /* Grid Card View */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          {filteredItems.map((item) => (
            <div
              key={item.name}
              onClick={() => openEditDrawer(item)}
              className="bg-card rounded-xl border border-hair shadow-xs hover:shadow-md transition-all relative flex flex-col group overflow-hidden cursor-pointer"
            >
              {/* Image Thumbnail */}
              <div className="h-28 w-full shrink-0 relative bg-muted/60 overflow-hidden">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.item_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-1 select-none">
                    <Package className="w-7 h-7" />
                    <span className="text-[11px] font-mono tracking-wider">
                      {(item.item_name || 'IT').slice(0, 3).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Status Badge in Corner */}
                <div className="absolute top-2 right-2">
                  {item.disabled ? (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shadow-xs">
                      Disabled
                    </Badge>
                  ) : (
                    <Badge variant="tagSuccess" className="text-[10px] px-1.5 py-0 shadow-xs">
                      Active
                    </Badge>
                  )}
                </div>

                {/* Lightbox Trigger Icon */}
                {item.image && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImageUrl(item.image || null);
                    }}
                    className="absolute bottom-2 right-2 p-1 bg-black/50 text-white rounded-md hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Preview Image"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Card Body */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3
                    className="font-semibold text-foreground text-sm leading-snug line-clamp-2 mb-1 group-hover:text-primary transition-colors"
                    title={item.item_name}
                  >
                    {item.item_name}
                  </h3>
                  <div className="flex items-center gap-1.5 mb-2 text-[11px] text-muted-foreground">
                    <span className="font-mono truncate">{item.item_code || item.name}</span>
                    <span>•</span>
                    <span className="truncate">{item.item_group || 'General'}</span>
                  </div>
                </div>

                {/* Rate & Bottom Actions */}
                <div className="pt-2 border-t border-hair/60 mt-auto flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground block -mb-0.5">Rate</span>
                    <span className="font-bold text-foreground text-sm tabular-nums">
                      {formatCurrency(item.standard_rate || 0)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(item);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      title="Delete Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDrawer(item);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-hair rounded-md transition-colors"
                      title="Edit Item"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* DataTable List View */
        <div className="bg-card rounded-xl border border-hair overflow-hidden shadow-xs">
          <DataTable
            columns={columns}
            rows={filteredItems}
            emptyMessage="No items found matching criteria."
            onRowClick={(row) => openEditDrawer(row)}
          />
        </div>
      )}

      {/* Add / Edit SideDrawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingItem ? `Edit Item: ${editingItem.item_name}` : 'Add New Item'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4 text-sm">
          {/* Top Bar for Edit Mode: DeskLink */}
          {editingItem && (
            <div className="flex items-center justify-between pb-3 border-b border-border text-xs">
              <span className="text-muted-foreground">
                ERPNext ID: <span className="font-mono font-medium text-foreground">{editingItem.name}</span>
              </span>
              <DeskLink doctype="Item" name={editingItem.name} label="Open in ERPNext Desk" />
            </div>
          )}

          {/* Item Name */}
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">
              Item Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={formData.item_name}
              onChange={(e) => handleItemNameChange(e.target.value)}
              placeholder="e.g. Chicken Mandi, Cold Coffee"
              required
            />
          </div>

          {/* Item Code (ID in ERPNext) */}
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">
              Item Code / ID <span className="text-destructive">*</span>
            </label>
            <Input
              value={formData.item_code}
              onChange={(e) => {
                setCodeManuallyEdited(true);
                setFormData({ ...formData, item_code: e.target.value });
              }}
              placeholder="e.g. CM-01 or unique code"
              required
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Unique identifier stored in ERPNext. Renaming will update linked records automatically.
            </p>
          </div>

          {/* Item Group & Stock UOM Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">
                Item Group <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                id="item-group"
                value={formData.item_group}
                onChange={(_, val) => setFormData({ ...formData, item_group: val })}
                options={itemGroups.map((g) => ({ value: g.name, label: g.name }))}
                placeholder="Select Item Group"
                strict={false}
              />
            </div>
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">
                Stock UOM <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                id="stock-uom"
                value={formData.stock_uom}
                onChange={(_, val) => setFormData({ ...formData, stock_uom: val })}
                options={uoms.map((u) => ({ value: u.name, label: u.name }))}
                placeholder="Select Unit of Measure"
                strict={false}
              />
            </div>
          </div>

          {/* Standard Selling Rate */}
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">
              Standard Selling Rate ({currencySymbol})
            </label>
            <Input
              type="number"
              step="any"
              min="0"
              value={formData.standard_rate}
              onChange={(e) => setFormData({ ...formData, standard_rate: e.target.value })}
              placeholder="0.00"
            />
          </div>

          {/* Image Upload & Preview */}
          <div className="space-y-2 pt-1">
            <label className="block font-semibold text-muted-foreground mb-1">
              Item Image
            </label>
            {formData.image ? (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-hair bg-muted/40">
                <img
                  src={formData.image}
                  alt="Item Preview"
                  className="w-14 h-14 rounded-md object-cover border border-hair cursor-pointer shrink-0"
                  onClick={() => setPreviewImageUrl(formData.image)}
                  title="Click to preview"
                />
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium text-foreground truncate">
                    {formData.image_name || 'Uploaded Image'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate font-mono">
                    {formData.image}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, image: '', image_name: '' })}
                  className="text-destructive hover:bg-destructive/10 text-xs shrink-0"
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="border border-dashed border-hair rounded-lg p-4 text-center bg-card hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  id="item-image-file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="item-image-file"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                >
                  {uploadingImage ? (
                    <Spinner className="w-5 h-5 text-primary" />
                  ) : (
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold text-primary">
                    {uploadingImage ? 'Uploading Image...' : 'Click to Upload Image'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    PNG, JPG, WebP up to 5MB
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">
              Description / Notes
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add optional notes or item details..."
              rows={2}
            />
          </div>

          {/* Feature Toggles Partition */}
          <div className="pt-2 border-t border-hair space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
              Item Properties & Controls
            </span>

            {/* Is Sales Item */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-hair bg-muted/20">
              <div>
                <label htmlFor="is-sales" className="font-medium text-foreground block cursor-pointer">
                  Is Sales Item
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Available for selling in URY POS & Sales Invoices
                </p>
              </div>
              <Switch
                id="is-sales"
                checked={formData.is_sales_item}
                onCheckedChange={(checked) => setFormData({ ...formData, is_sales_item: checked })}
              />
            </div>

            {/* Is Stock Item */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-hair bg-muted/20">
              <div>
                <label htmlFor="is-stock" className="font-medium text-foreground block cursor-pointer">
                  Maintain Stock
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Track inventory levels & warehouse movements
                </p>
              </div>
              <Switch
                id="is-stock"
                checked={formData.is_stock_item}
                onCheckedChange={(checked) => setFormData({ ...formData, is_stock_item: checked })}
              />
            </div>

            {/* Conditional Stock Fields */}
            {formData.is_stock_item && (
              <div className="grid grid-cols-2 gap-3 pl-3 pr-1 py-1 border-l-2 border-primary/40 bg-muted/10 rounded-r-lg">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Opening Stock
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={formData.opening_stock}
                    onChange={(e) => setFormData({ ...formData, opening_stock: e.target.value })}
                    placeholder="0"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Valuation Rate ({currencySymbol})
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={formData.valuation_rate}
                    onChange={(e) => setFormData({ ...formData, valuation_rate: e.target.value })}
                    placeholder="0.00"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Is Purchase Item */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-hair bg-muted/20">
              <div>
                <label htmlFor="is-purchase" className="font-medium text-foreground block cursor-pointer">
                  Is Purchase Item
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Allow purchasing from suppliers / raw material orders
                </p>
              </div>
              <Switch
                id="is-purchase"
                checked={formData.is_purchase_item}
                onCheckedChange={(checked) => setFormData({ ...formData, is_purchase_item: checked })}
              />
            </div>

            {/* Include in Manufacturing */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-hair bg-muted/20">
              <div>
                <label htmlFor="is-mfg" className="font-medium text-foreground block cursor-pointer">
                  Include in Manufacturing
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Allow creating BOMs & production work orders
                </p>
              </div>
              <Switch
                id="is-mfg"
                checked={formData.include_item_in_manufacturing}
                onCheckedChange={(checked) => setFormData({ ...formData, include_item_in_manufacturing: checked })}
              />
            </div>

            {/* Is Disposable Item */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-hair bg-muted/20">
              <div>
                <label htmlFor="is-disposable" className="font-medium text-foreground block cursor-pointer">
                  Is Disposable Item
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Packaging, container, or cutlery charged during takeaway/delivery
                </p>
              </div>
              <Switch
                id="is-disposable"
                checked={formData.is_disposable}
                onCheckedChange={(checked) => setFormData({ ...formData, is_disposable: checked })}
              />
            </div>

            {/* Disabled Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-hair bg-muted/20">
              <div>
                <label htmlFor="is-disabled" className="font-medium text-foreground block cursor-pointer">
                  Disabled / Inactive
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Hide item from POS, menu ordering, and new sales
                </p>
              </div>
              <Switch
                id="is-disabled"
                checked={formData.disabled}
                onCheckedChange={(checked) => setFormData({ ...formData, disabled: checked })}
              />
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="pt-5 flex items-center justify-between border-t border-hair mt-6">
            {editingItem ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => openDeleteDialog(editingItem)}
                className="text-destructive hover:bg-destructive/10 border-destructive/20 text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDrawerOpen(false)}
                disabled={saving}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs shadow-xs min-w-[100px]"
                disabled={saving}
              >
                {saving ? (
                  <div className="flex items-center gap-1.5">
                    <Spinner className="w-3.5 h-3.5" />
                    <span>Saving...</span>
                  </div>
                ) : editingItem ? (
                  'Save Changes'
                ) : (
                  'Create Item'
                )}
              </Button>
            </div>
          </div>
        </form>
      </SideDrawer>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Item"
        description={`Are you sure you want to permanently delete "${itemToDelete?.item_name || itemToDelete?.name}" (${itemToDelete?.item_code || itemToDelete?.name})? This will delete the item from ERPNext and URY.`}
        confirmLabel="Delete Item"
        confirmVariant="danger"
        isSubmitting={deleting}
        onConfirm={handleConfirmDelete}
      />

      {/* Image Preview Lightbox Portal */}
      {previewImageUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setPreviewImageUrl(null)}
          >
            <div
              className="relative max-w-2xl max-h-[85vh] bg-card rounded-xl overflow-hidden shadow-2xl p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewImageUrl(null)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={previewImageUrl}
                alt="Item Preview"
                className="max-h-[80vh] w-auto object-contain rounded-lg mx-auto"
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ItemMasterPage;
