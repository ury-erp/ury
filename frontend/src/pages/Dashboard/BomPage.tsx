import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Search,
  List,
  Grid,
  Eye,
  RefreshCw,
  Boxes,
  Coins,
  Package,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Input,
  Spinner,
  showToast,
  DataTable,
  type DataTableColumn,
} from '@ury/ui';
import { useCompanyContext } from '../../context/CompanyContext';
import { useBranchContext } from '../../context/BranchContext';
import { formatCurrency, call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';
import { PageToolbar } from '../../components/layout/PageToolbar';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { DeskLink } from '../../components/DeskLink';

export interface BomItemRow {
  name?: string;
  item_code: string;
  item_name?: string;
  qty: number;
  uom: string;
  rate?: number;
  amount?: number;
  stock_uom?: string;
  bom_no?: string;
}

export interface BomRecord {
  name: string;
  item: string;
  item_name?: string;
  company: string;
  quantity: number;
  uom: string;
  is_active: number;
  is_default: number;
  docstatus: number; // 0 = Draft, 1 = Submitted, 2 = Cancelled
  has_variants?: number;
  currency?: string;
  raw_material_cost?: number;
  operating_cost?: number;
  total_cost?: number;
  rm_cost_as_per?: string;
  buying_price_list?: string;
  description?: string;
  modified?: string;
  creation?: string;
  items?: BomItemRow[];
}

export type BomStatus = 'Default' | 'Active' | 'Not active' | 'Draft' | 'Cancelled' | 'Template';

export interface BomStatusDisplay {
  label: BomStatus;
  variant: 'tagSuccess' | 'tagInfo' | 'destructive' | 'outline';
  dotColor: string;
  badgeClass: string;
}

/**
 * Derives the exact BOM status indicator as defined in ERPNext
 * (erpnext/manufacturing/doctype/bom/bom_list.js + frappe.get_indicator).
 */
export function getBomStatus(bom: BomRecord): BomStatusDisplay {
  if (bom.docstatus === 0) {
    return {
      label: 'Draft',
      variant: 'outline',
      dotColor: 'bg-amber-500',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium',
    };
  }
  if (bom.docstatus === 2) {
    return {
      label: 'Cancelled',
      variant: 'destructive',
      dotColor: 'bg-red-500',
      badgeClass: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-medium',
    };
  }
  // docstatus === 1 (Submitted)
  if (bom.is_active && (bom as any).has_variants) {
    return {
      label: 'Template',
      variant: 'outline',
      dotColor: 'bg-orange-500',
      badgeClass: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium',
    };
  }
  if (bom.is_default) {
    return {
      label: 'Default',
      variant: 'tagSuccess',
      dotColor: 'bg-emerald-500',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium',
    };
  }
  if (bom.is_active) {
    return {
      label: 'Active',
      variant: 'tagInfo',
      dotColor: 'bg-blue-500',
      badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium',
    };
  }
  return {
    label: 'Not active',
    variant: 'outline',
    dotColor: 'bg-slate-400 dark:bg-slate-500',
    badgeClass: 'border-hair bg-muted/60 text-muted-foreground font-medium',
  };
}

const BOM_FIELDS = [
  'name',
  'item',
  'item_name',
  'company',
  'quantity',
  'uom',
  'is_active',
  'is_default',
  'docstatus',
  'has_variants',
  'currency',
  'raw_material_cost',
  'operating_cost',
  'total_cost',
  'rm_cost_as_per',
  'buying_price_list',
  'description',
  'modified',
  'creation',
];

export const BomPage: React.FC = () => {
  const { activeCompanyId } = useCompanyContext();
  const { activeBranchId, activeBranch, branches } = useBranchContext();

  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters & View Mode
  const [search, setSearch] = useState<string>('');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Branch-mapped BOM names
  const [branchBomNames, setBranchBomNames] = useState<Set<string> | null>(null);

  // Inspection Drawer State (Read-only Details View)
  const [selectedBom, setSelectedBom] = useState<BomRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);

  // Track BOM names mapped to the active branch via URY Item Production Configuration
  const fetchBranchBoms = useCallback(async () => {
    if (!activeBranchId || activeBranchId === 'all') {
      setBranchBomNames(null);
      return;
    }
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'URY Item Production Configuration',
        fields: ['bom', 'branch'],
        filters: [
          ['branch', '=', activeBranchId],
          ['bom', '!=', ''],
        ],
        limit_page_length: 5000,
      });
      const list = Array.isArray(res?.message) ? res.message : Array.isArray(res) ? res : [];
      const set = new Set<string>();
      list.forEach((r: any) => {
        if (r.bom) set.add(r.bom);
      });
      setBranchBomNames(set);
    } catch (err) {
      console.error('Failed to fetch branch BOM configurations', err);
      setBranchBomNames(new Set());
    }
  }, [activeBranchId]);

  useEffect(() => {
    fetchBranchBoms();
  }, [fetchBranchBoms]);

  // Fetch BOM records and their child items from ERPNext
  const fetchBoms = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [bomsRes, itemsRes] = await Promise.all([
        call<any>('frappe.client.get_list', {
          doctype: 'BOM',
          fields: BOM_FIELDS,
          order_by: 'is_default desc, modified desc',
          limit_page_length: 1000,
        }),
        call<any>('frappe.client.get_list', {
          doctype: 'BOM Item',
          fields: [
            'parent',
            'item_code',
            'item_name',
            'qty',
            'uom',
            'rate',
            'amount',
            'stock_uom',
            'bom_no',
          ],
          limit_page_length: 5000,
        }),
      ]);

      const bomList: BomRecord[] = Array.isArray(bomsRes?.message)
        ? bomsRes.message
        : Array.isArray(bomsRes)
        ? bomsRes
        : [];

      const childItems: any[] = Array.isArray(itemsRes?.message)
        ? itemsRes.message
        : Array.isArray(itemsRes)
        ? itemsRes
        : [];

      // Group child items by parent BOM name
      const itemsByParent: Record<string, BomItemRow[]> = {};
      childItems.forEach((ci) => {
        if (!ci.parent) return;
        if (!itemsByParent[ci.parent]) {
          itemsByParent[ci.parent] = [];
        }
        itemsByParent[ci.parent].push({
          name: ci.name,
          item_code: ci.item_code,
          item_name: ci.item_name,
          qty: ci.qty !== undefined ? Number(ci.qty) : 0,
          uom: ci.uom || ci.stock_uom || '',
          rate: ci.rate !== undefined ? Number(ci.rate) : 0,
          amount: ci.amount !== undefined ? Number(ci.amount) : 0,
          stock_uom: ci.stock_uom,
          bom_no: ci.bom_no,
        });
      });

      // Attach child items to parent BOM
      const mergedBoms = bomList.map((b) => ({
        ...b,
        items: itemsByParent[b.name] || [],
      }));

      setBoms(mergedBoms);
      if (isManualRefresh) {
        showToast.success('BOMs synced with ERPNext');
        fetchBranchBoms();
      }
    } catch (err: any) {
      console.error('Failed to fetch BOMs', err);
      showToast.error(err?.message || 'Failed to load BOMs from ERPNext');
      setBoms([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchBranchBoms]);

  useEffect(() => {
    fetchBoms();
  }, [fetchBoms]);

  // Unique finished items that have BOMs
  const finishedItemsWithOptions = useMemo(() => {
    const map = new Map<string, string>();
    boms.forEach((b) => {
      if (b.item) {
        map.set(b.item, b.item_name || b.item);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({
      value,
      label: `${label} (${value})`,
    }));
  }, [boms]);

  // Open Drawer in Read-only Inspection Mode
  const openViewDrawer = async (bom: BomRecord) => {
    setSelectedBom(bom);
    setIsDrawerOpen(true);
    setLoadingDoc(true);

    try {
      const docRes = await call<any>('frappe.client.get', {
        doctype: 'BOM',
        name: bom.name,
      });
      if (docRes?.message || docRes) {
        const fullDoc = docRes.message || docRes;
        setSelectedBom({
          ...bom,
          ...fullDoc,
          items: Array.isArray(fullDoc.items)
            ? fullDoc.items.map((row: any) => ({
                name: row.name,
                item_code: row.item_code,
                item_name: row.item_name,
                qty: Number(row.qty || 0),
                uom: row.uom || row.stock_uom || '',
                rate: Number(row.rate || 0),
                amount: Number(row.amount || (row.qty || 0) * (row.rate || 0)),
                stock_uom: row.stock_uom,
                bom_no: row.bom_no,
              }))
            : bom.items || [],
        });
      }
    } catch (err) {
      console.warn('Could not load authoritative BOM document from ERPNext, using cached list item', err);
    } finally {
      setLoadingDoc(false);
    }
  };

  // Filter BOMs by search, item, ERPNext status, header company, and header branch
  const filteredBoms = useMemo(() => {
    return boms.filter((bom) => {
      // 1. Company filter from top header context
      if (activeCompanyId && activeCompanyId !== 'all') {
        if (bom.company && bom.company !== activeCompanyId) {
          return false;
        }
      }

      // 2. Branch filter from top header context
      if (activeBranchId && activeBranchId !== 'all') {
        if (branchBomNames !== null) {
          if (!branchBomNames.has(bom.name)) {
            return false;
          }
        } else {
          const currentBranchObj =
            activeBranch || branches.find((b: any) => (b.id || b.name) === activeBranchId);
          if (currentBranchObj?.company && bom.company && bom.company !== currentBranchObj.company) {
            return false;
          }
        }
      }

      // 3. Search query filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = bom.name.toLowerCase().includes(q);
        const matchItem = (bom.item || '').toLowerCase().includes(q);
        const matchItemName = (bom.item_name || '').toLowerCase().includes(q);
        const matchComponent = bom.items?.some(
          (c) => (c.item_code || '').toLowerCase().includes(q) || (c.item_name || '').toLowerCase().includes(q)
        );
        if (!matchName && !matchItem && !matchItemName && !matchComponent) return false;
      }

      // 4. Finished Item dropdown filter
      if (itemFilter !== 'all' && bom.item !== itemFilter) {
        return false;
      }

      // 5. Status filter matching ERPNext BOM statuses exactly
      if (statusFilter !== 'all') {
        const currentStatus = getBomStatus(bom).label;
        if (currentStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [boms, search, itemFilter, statusFilter, activeCompanyId, activeBranchId, branchBomNames, activeBranch, branches]);

  // DataTable Columns for List View
  const columns: DataTableColumn<BomRecord>[] = [
    {
      key: 'item',
      header: 'Finished Product',
      render: (bom) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary border border-hair">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <button
              onClick={() => openViewDrawer(bom)}
              className="text-left font-semibold text-foreground hover:text-primary transition-colors text-xs"
            >
              {bom.item_name || bom.item}
            </button>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono">{bom.name}</span>
              <span>•</span>
              <span className="font-medium text-foreground/80">
                {bom.quantity} {bom.uom}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (bom) => {
        const statusInfo = getBomStatus(bom);
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${statusInfo.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
              <span>{statusInfo.label}</span>
            </span>
          </div>
        );
      },
    },
    {
      key: 'components',
      header: 'Raw Materials',
      render: (bom) => {
        const count = bom.items?.length || 0;
        return (
          <div className="flex flex-col text-xs">
            <span className="font-medium text-foreground">
              {count} {count === 1 ? 'component' : 'components'}
            </span>
            {count > 0 && (
              <span
                className="text-[11px] text-muted-foreground truncate max-w-[200px]"
                title={bom.items?.map((i) => i.item_name || i.item_code).join(', ')}
              >
                {bom.items?.slice(0, 2).map((i) => i.item_name || i.item_code).join(', ')}
                {count > 2 ? `, +${count - 2} more` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'cost',
      header: 'Total Cost',
      align: 'right',
      render: (bom) => {
        const total = bom.total_cost || bom.raw_material_cost || 0;
        return (
          <div className="flex flex-col items-end text-xs">
            <span className="font-semibold text-foreground">
              {formatCurrency(total)}
            </span>
            {bom.raw_material_cost !== undefined && (
              <span className="text-[11px] text-muted-foreground">
                RM: {formatCurrency(bom.raw_material_cost)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'company',
      header: 'Company',
      render: (bom) => (
        <span className="text-xs text-muted-foreground truncate max-w-[140px] block" title={bom.company}>
          {bom.company}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (bom) => (
        <div className="flex items-center justify-end gap-1.5">
          <DeskLink doctype="BOM" name={bom.name} iconOnly />
          <button
            onClick={() => openViewDrawer(bom)}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-hair rounded-md transition-colors"
            title="View BOM Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Information */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            <span>Bill of Materials (BOM)</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View recipe configurations, raw materials, and production costs from ERPNext
          </p>
        </div>
      </div>

      {/* Filter and View Controls Toolbar (No Create Button) */}
      <PageToolbar>
        <div className="flex flex-1 items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search BOM or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="w-[200px]">
            <SearchableSelect
              id="bom-item-filter"
              value={itemFilter}
              onChange={(_, val) => setItemFilter(val)}
              options={[{ value: 'all', label: 'All Finished Goods' }, ...finishedItemsWithOptions]}
              placeholder="Filter by Finished Item"
            />
          </div>

          <div className="w-[160px]">
            <SearchableSelect
              id="bom-status-filter"
              value={statusFilter}
              onChange={(_, val) => setStatusFilter(val)}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'Default', label: 'Default' },
                { value: 'Active', label: 'Active' },
                { value: 'Not active', label: 'Not active' },
                { value: 'Draft', label: 'Draft' },
                { value: 'Cancelled', label: 'Cancelled' },
              ]}
              placeholder="Filter by Status"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-lg border border-hair p-0.5 bg-muted/40">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

          <Badge
            variant="outline"
            className="h-8 px-2.5 border-hair bg-muted text-muted-foreground text-xs font-medium shrink-0"
          >
            {filteredBoms.length} {filteredBoms.length === 1 ? 'BOM' : 'BOMs'}
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBoms(true)}
            disabled={refreshing || loading}
            className="h-9 px-2.5"
            title="Sync with ERPNext"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </PageToolbar>

      {/* Content Area */}
      {loading ? (
        <Card padding="none" className="py-24 flex items-center justify-center rounded-xl border border-hair">
          <Spinner className="w-8 h-8 text-primary" />
        </Card>
      ) : filteredBoms.length === 0 ? (
        <Card padding="none" className="p-16 flex flex-col items-center justify-center text-center rounded-xl border border-hair">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5 text-primary">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">No Bill of Materials Found</h3>
          <p className="text-muted-foreground max-w-sm text-sm">
            {search || itemFilter !== 'all' || statusFilter !== 'all'
              ? 'No BOMs match your selected search or filters. Try adjusting your search query.'
              : 'No Bill of Materials found in ERPNext. BOMs created in ERPNext will appear here.'}
          </p>
        </Card>
      ) : viewMode === 'grid' ? (
        /* Grid Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredBoms.map((bom) => {
            const count = bom.items?.length || 0;
            const total = bom.total_cost || bom.raw_material_cost || 0;
            const statusInfo = getBomStatus(bom);

            return (
              <div
                key={bom.name}
                onClick={() => openViewDrawer(bom)}
                className="bg-card rounded-xl border border-hair shadow-xs hover:shadow-md transition-all flex flex-col p-4 cursor-pointer group hover:border-primary/40 relative"
              >
                {/* Header: Item & BOM Name */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary border border-hair">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {bom.item_name || bom.item}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                        <span>{bom.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <DeskLink doctype="BOM" name={bom.name} iconOnly />
                  </div>
                </div>

                {/* Status & Output Qty */}
                <div className="flex items-center justify-between gap-1.5 mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border ${statusInfo.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
                    <span>{statusInfo.label}</span>
                  </span>

                  <Badge variant="outline" className="border-hair bg-muted/60 text-[10px] px-1.5 py-0 font-medium">
                    {bom.quantity} {bom.uom}
                  </Badge>
                </div>

                {/* Cost & Raw Materials Summary */}
                <div className="bg-muted/40 rounded-lg p-2.5 text-xs space-y-1.5 mb-3 border border-hair">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Cost:</span>
                    <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">Raw Materials:</span>
                    <span className="text-foreground font-medium">
                      {count} {count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>

                {/* Ingredient Preview List */}
                {count > 0 && (
                  <div className="text-[11px] text-muted-foreground border-t border-hair pt-2 mb-3 space-y-1 flex-1">
                    {bom.items?.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center truncate">
                        <span className="truncate pr-2">{item.item_name || item.item_code}</span>
                        <span className="font-mono text-[10px] text-foreground/80 shrink-0">
                          {item.qty} {item.uom}
                        </span>
                      </div>
                    ))}
                    {count > 3 && (
                      <div className="text-[10px] text-primary/80 italic pt-0.5">
                        +{count - 3} more raw materials
                      </div>
                    )}
                  </div>
                )}

                {/* Card Footer: Company & View Details Action */}
                <div
                  className="mt-auto pt-2.5 border-t border-hair flex items-center justify-between text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[11px] text-muted-foreground truncate max-w-[130px]" title={bom.company}>
                    {bom.company}
                  </span>

                  <button
                    onClick={() => openViewDrawer(bom)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Details</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List DataTable View */
        <div className="bg-card rounded-xl border border-hair overflow-hidden shadow-xs">
          <DataTable
            columns={columns}
            rows={filteredBoms}
            emptyMessage="No Bill of Materials found"
            onRowClick={(bom) => openViewDrawer(bom)}
          />
        </div>
      )}

      {/* SideDrawer: Read-Only BOM Details View */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Bill of Materials Details"
        subtitle={selectedBom?.name}
        maxWidth="max-w-3xl"
      >
        {selectedBom ? (
          <div className="space-y-5 pb-6">
            {loadingDoc && (
              <div className="p-2 bg-muted/40 rounded-md text-xs text-muted-foreground flex items-center gap-2">
                <Spinner className="w-3 h-3 text-primary" />
                <span>Loading latest authoritative details from ERPNext...</span>
              </div>
            )}

            {/* Header / Status Banner */}
            <div className="flex items-center justify-between p-3.5 bg-card rounded-lg border border-hair flex-wrap gap-2">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                  Status
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {(() => {
                    const statusInfo = getBomStatus(selectedBom);
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${statusInfo.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
                        <span>{statusInfo.label}</span>
                      </span>
                    );
                  })()}

                  {selectedBom.docstatus === 1 ? (
                    <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px]">
                      Submitted (docstatus 1)
                    </Badge>
                  ) : selectedBom.docstatus === 2 ? (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px]">
                      Cancelled (docstatus 2)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                      Draft (docstatus 0)
                    </Badge>
                  )}
                </div>
              </div>

              <div className="text-right">
                <DeskLink doctype="BOM" name={selectedBom.name} label="Open in ERPNext Desk" />
              </div>
            </div>

            {/* Section: Output Finished Good */}
            <div className="bg-muted/30 p-3.5 rounded-lg border border-hair space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-primary" />
                <span>Finished Product (Output)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Item to Manufacture:</span>
                  <span className="font-semibold text-foreground text-sm block">
                    {selectedBom.item_name || selectedBom.item}
                  </span>
                  <span className="font-mono text-muted-foreground text-[11px] block">
                    Code: {selectedBom.item}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Output Quantity:</span>
                  <span className="font-semibold text-foreground text-sm block">
                    {selectedBom.quantity} {selectedBom.uom}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Company:</span>
                  <span className="font-medium text-foreground block">{selectedBom.company}</span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Costing Method:</span>
                  <span className="font-medium text-foreground block">
                    {selectedBom.rm_cost_as_per || 'Valuation Rate'}
                    {selectedBom.buying_price_list ? ` (${selectedBom.buying_price_list})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Section: Costing Breakdown */}
            <div className="bg-muted/30 p-3.5 rounded-lg border border-hair space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-primary" />
                <span>Cost Summary</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-card p-2.5 rounded-md border border-hair">
                  <span className="text-[11px] text-muted-foreground block">Raw Material Cost:</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(selectedBom.raw_material_cost || 0)}
                  </span>
                </div>

                <div className="bg-card p-2.5 rounded-md border border-hair">
                  <span className="text-[11px] text-muted-foreground block">Operating Cost:</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(selectedBom.operating_cost || 0)}
                  </span>
                </div>

                <div className="bg-card p-2.5 rounded-md border border-hair col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-muted-foreground block">Total Cost:</span>
                  <span className="text-base font-bold text-foreground">
                    {formatCurrency(selectedBom.total_cost || selectedBom.raw_material_cost || 0)}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground flex justify-between items-center pt-1 border-t border-hair">
                <span>Calculated Unit Cost:</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(
                    (selectedBom.total_cost || selectedBom.raw_material_cost || 0) / (selectedBom.quantity || 1)
                  )}{' '}
                  / {selectedBom.uom}
                </span>
              </div>
            </div>

            {/* Section: Raw Materials (Components Table) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-primary" />
                  <span>Raw Materials / Components ({selectedBom.items?.length || 0})</span>
                </h4>
              </div>

              <div className="border border-hair rounded-lg overflow-hidden bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-muted/60 border-b border-hair text-muted-foreground">
                        <th className="py-2 px-3 font-semibold w-10">#</th>
                        <th className="py-2 px-3 font-semibold">Item</th>
                        <th className="py-2 px-3 font-semibold text-right">Quantity</th>
                        <th className="py-2 px-3 font-semibold">UOM</th>
                        <th className="py-2 px-3 font-semibold text-right">Rate</th>
                        <th className="py-2 px-3 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hair">
                      {selectedBom.items && selectedBom.items.length > 0 ? (
                        selectedBom.items.map((row, idx) => (
                          <tr key={row.name || idx} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-muted-foreground text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-medium text-foreground block">
                                {row.item_name || row.item_code}
                              </span>
                              <span className="font-mono text-muted-foreground text-[10px]">
                                {row.item_code}
                              </span>
                              {row.bom_no && (
                                <span className="text-[10px] text-primary block">
                                  Sub-BOM: {row.bom_no}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium">{row.qty}</td>
                            <td className="py-2.5 px-3 text-muted-foreground">{row.uom}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                              {formatCurrency(row.rate || 0)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold font-mono text-foreground">
                              {formatCurrency(row.amount || 0)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            No raw material components defined in this BOM.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total Summary Footer inside Table */}
                <div className="bg-muted/40 p-3 flex items-center justify-between border-t border-hair text-xs">
                  <span className="font-medium text-muted-foreground">
                    Total Materials Cost ({selectedBom.items?.length || 0} items):
                  </span>
                  <div className="text-right">
                    <span className="text-base font-bold text-foreground">
                      {formatCurrency(selectedBom.raw_material_cost || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description / Recipe Notes */}
            {selectedBom.description && (
              <div className="bg-muted/30 p-3.5 rounded-lg border border-hair space-y-1.5 text-xs">
                <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider block">
                  Description / Recipe Notes
                </span>
                <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedBom.description}
                </p>
              </div>
            )}

            {/* Drawer Footer with Close and DeskLink */}
            <div className="pt-3 border-t border-hair flex items-center justify-between gap-2.5">
              <DeskLink doctype="BOM" name={selectedBom.name} label="Open in ERPNext Desk" />
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDrawerOpen(false)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </SideDrawer>
    </div>
  );
};

export default BomPage;
