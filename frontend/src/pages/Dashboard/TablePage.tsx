import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Grid, Plus, Users, Square, List, Edit2, LayoutTemplate } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast, DataTable, type DataTableColumn } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { Switch } from '../../components/ui/switch';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';
import { PageToolbar } from '../../components/layout/PageToolbar';
import TableLayoutView from './TableLayoutView';
import { __ } from '../../i18n';

interface UryTableRecord {
  name: string;
  table_name?: string;
  no_of_seats?: number;
  minimum_seating?: number;
  restaurant?: string;
  restaurant_room?: string;
  branch?: string;
  table_shape?: string;
  is_take_away?: boolean;
  status?: string;
}

export const TablePage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [tables, setTables] = useState<UryTableRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'layout'>('list');
  const [editingTable, setEditingTable] = useState<UryTableRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Branch options from Branch doctype
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  // Room options from URY Room doctype
  const [rooms, setRooms] = useState<{ name: string }[]>([]);

  const [newTable, setNewTable] = useState({
    table_name: '',
    no_of_seats: '4',
    minimum_seating: '1',
    branch: '',
    restaurant_room: '',
    table_shape: 'Square',
    is_take_away: false,
  });

  const fetchBranches = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('Branch', 'all');
      setBranches(res || []);
    } catch {
      setBranches([]);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('URY Room', activeBranchId);
      setRooms(res || []);
    } catch {
      setRooms([]);
    }
  };

  const fetchTables = async () => {
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<UryTableRecord>('URY Table', activeBranchId);
      setTables(records);
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchRooms();
    fetchTables();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingTable(null);
    setNewTable({
      table_name: '',
      no_of_seats: '4',
      minimum_seating: '1',
      branch: activeBranchId !== 'all' ? activeBranchId : '',
      restaurant_room: '',
      table_shape: 'Square',
      is_take_away: false,
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (table: UryTableRecord) => {
    setEditingTable(table);
    // Derive display name from table_name or name, stripping branch suffix if present
    let displayName = table.table_name || table.name || '';
    const branchName = table.branch || activeBranchId;

    // Strip all trailing ` - ${branchName}` occurrences to handle already-compounded corruption
    while (displayName.endsWith(` - ${branchName}`)) {
      displayName = displayName.substring(0, displayName.length - (` - ${branchName}`).length);
    }

    setNewTable({
      table_name: displayName,
      no_of_seats: table.no_of_seats?.toString() || '4',
      minimum_seating: table.minimum_seating?.toString() || '1',
      branch: table.branch || '',
      restaurant_room: table.restaurant_room || '',
      table_shape: table.table_shape || 'Square',
      is_take_away: !!table.is_take_away,
    });
    setIsDrawerOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.table_name) return;

    if (!newTable.restaurant_room || !newTable.restaurant_room.trim()) {
      showToast.warning(__('Please select a room for the table'));
      return;
    }

    setSaving(true);
    try {
      if (editingTable) {
        const original = {
          table_name: editingTable.table_name || editingTable.name || '',
          no_of_seats: parseInt(editingTable.no_of_seats as any) || 0,
          minimum_seating: parseInt(editingTable.minimum_seating as any) || 0,
          branch: editingTable.branch || '',
          restaurant_room: editingTable.restaurant_room || '',
          table_shape: editingTable.table_shape || 'Square',
          is_take_away: editingTable.is_take_away ? 1 : 0,
        };
        const current = {
          table_name: newTable.table_name || '',
          no_of_seats: parseInt(newTable.no_of_seats as any) || 0,
          minimum_seating: parseInt(newTable.minimum_seating as any) || 0,
          branch: newTable.branch || '',
          restaurant_room: newTable.restaurant_room || '',
          table_shape: newTable.table_shape || 'Square',
          is_take_away: newTable.is_take_away ? 1 : 0,
        };
        if (JSON.stringify(original) === JSON.stringify(current)) {
          showToast.warning(__('No changes in document'));
          setSaving(false);
          return;
        }

        let currentName = editingTable.name;
        if (newTable.table_name !== editingTable.name) {
          await call('frappe.client.rename_doc', {
            doctype: 'URY Table',
            old_name: editingTable.name,
            new_name: newTable.table_name,
          });
          currentName = newTable.table_name;
        }

        await call('frappe.client.set_value', {
          doctype: 'URY Table',
          name: currentName,
          fieldname: {
            table_name: newTable.table_name,
            no_of_seats: parseInt(newTable.no_of_seats),
            minimum_seating: parseInt(newTable.minimum_seating),
            branch: newTable.branch,
            restaurant_room: newTable.restaurant_room,
            table_shape: newTable.table_shape,
            is_take_away: newTable.is_take_away ? 1 : 0,
          },
        });
      } else {
        let restaurantName = '';
        if (newTable.branch) {
          try {
            const resList = await call<any>('frappe.client.get_list', {
              doctype: 'URY Restaurant',
              filters: [['branch', '=', newTable.branch]],
              fields: ['name'],
              limit: 1
            });
            const records = resList.message || resList || [];
            if (records.length > 0) {
              restaurantName = records[0].name;
            }
          } catch (err) {
            console.error('Failed to fetch restaurant for branch', err);
          }
        }
        if (!restaurantName) {
          showToast.error(__('No URY Restaurant configured for this branch — set one up first'));
          return;
        }

        await call('frappe.client.insert', {
          doc: {
            doctype: 'URY Table',
            name: newTable.table_name,
            table_name: newTable.table_name,
            restaurant: restaurantName,
            no_of_seats: parseInt(newTable.no_of_seats),
            minimum_seating: parseInt(newTable.minimum_seating),
            branch: newTable.branch || undefined,
            restaurant_room: newTable.restaurant_room,
            table_shape: newTable.table_shape,
            is_take_away: newTable.is_take_away ? 1 : 0,
          },
        });
      }
      showToast.success(__('Table saved'));
      fetchTables();
      setIsDrawerOpen(false);
    } catch (err) {
      console.error('Failed to save URY Table', err);
      showToast.error(__('Failed to save table: {0}', [err instanceof Error ? err.message : 'Unknown error']));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar — Partition Style */}
      <PageToolbar className="flex-col md:flex-row justify-between">
        <div className="flex bg-muted rounded-lg p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            variant="outline"
            onClick={() => setViewMode('layout')}
            className={`font-semibold flex items-center gap-1.5 ${viewMode === 'layout' ? 'bg-primary/10 border-primary/30 text-primary' : ''}`}
          >
            <LayoutTemplate className="w-4 h-4" />
            <span>{__('Edit Layout')}</span>
          </Button>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{__('Add Table')}</span>
          </Button>
        </div>
      </PageToolbar>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : tables.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Grid className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">{__('No Dining Tables Configured')}</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {__('Add dining tables to configure your restaurant layout.')}
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{__('Add Table')}</span>
          </Button>
        </Card>
      ) : viewMode === 'layout' ? (
        <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden h-[600px] relative">
          <TableLayoutView
            selectedRoom="All"
            tables={tables as any}
            onBackToGrid={() => setViewMode('list')}
            onRefresh={fetchTables}
          />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {tables.map((t) => (
            <Card key={t.name} className="p-5 rounded-lg border border-border bg-card shadow-xs hover:shadow-md transition-all hover:border-primary/20 flex flex-col justify-between relative group cursor-pointer" onClick={() => openEditDrawer(t)}>
              <div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                    <Square className="w-3 h-3 me-1" />
                    {t.table_shape || __('Square')}
                  </Badge>
                  <Badge variant={t.status === 'Occupied' ? 'warning' : 'success'} size="sm">
                    {t.status || __('Available')}
                  </Badge>
                </div>
                <h3 className="mt-3 text-xl font-bold text-foreground tracking-tight">{t.table_name || t.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">{t.restaurant_room || __('Main Hall')}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span className="flex items-center">
                  <Users className="w-3.5 h-3.5 me-1 text-primary" />
                  {t.no_of_seats || 4} {__('Seats')}
                </span>
                <span className="text-muted-foreground">{__('Branch:')} {t.branch || __('Main')}</span>
              </div>
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <Edit2 className="w-6 h-6 text-primary" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {(() => {
            const tableColumns: DataTableColumn<UryTableRecord>[] = [
              { key: 'table_name', header: __('Table Name'), render: (t) => t.table_name || t.name },
              { key: 'restaurant_room', header: __('Room'), render: (t) => t.restaurant_room || 'Main Hall' },
              { key: 'no_of_seats', header: __('Seats'), render: (t) => t.no_of_seats || 4 },
              {
                key: 'table_shape',
                header: __('Shape'),
                render: (t) => (
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                    {t.table_shape || __('Square')}
                  </Badge>
                ),
              },
              {
                key: 'status',
                header: __('Status'),
                render: (t) => (
                  <Badge variant={t.status === 'Occupied' ? 'warning' : 'success'} size="sm">
                    {t.status || __('Available')}
                  </Badge>
                ),
              },
              {
                key: 'name',
                header: __('Actions'),
                align: 'right',
                render: (t) => (
                  <Button variant="ghost" onClick={() => openEditDrawer(t)} className="text-gray-500 hover:text-primary">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                ),
              },
            ];

            return <DataTable columns={tableColumns} rows={tables} isLoading={loading} emptyMessage={__('No tables configured.')} />;
          })()}
        </>
      )}

      {/* Add/Edit SideDrawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingTable ? __('Edit Dining Table') : __('Add Dining Table')}
      >
        <form onSubmit={handleSaveTable} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">{__('Table Name')}</label>
              <Input
                value={newTable.table_name}
                onChange={(e) => setNewTable({ ...newTable, table_name: e.target.value })}
                required
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">{__('Seats Capacity')}</label>
                <Input
                  type="number"
                  value={newTable.no_of_seats}
                  onChange={(e) => setNewTable({ ...newTable, no_of_seats: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">{__('Min. Seating')}</label>
                <Input
                  type="number"
                  value={newTable.minimum_seating}
                  onChange={(e) => setNewTable({ ...newTable, minimum_seating: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>

            {/* Branch — Select from Branch doctype */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">{__('Branch')}</label>
              <SearchableSelect
                id="branch"
                value={newTable.branch}
                onChange={(_, value) => setNewTable({ ...newTable, branch: value })}
                options={[
                  { value: '', label: __('Select Branch') },
                  ...branches.map(b => ({ value: b.name, label: b.name }))
                ]}
              />
            </div>

            {/* Room — Select from URY Room docs */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">{__('Room')}</label>
              <SearchableSelect
                id="restaurant_room"
                value={newTable.restaurant_room}
                onChange={(_, value) => setNewTable({ ...newTable, restaurant_room: value })}
                options={[
                  { value: '', label: __('Select Room') },
                  ...rooms.map(r => ({ value: r.name, label: r.name }))
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">{__('Table Shape')}</label>
              <SearchableSelect
                id="table_shape"
                value={newTable.table_shape}
                onChange={(_, value) => setNewTable({ ...newTable, table_shape: value })}
                options={[
                  { value: 'Square', label: __('Square') },
                  { value: 'Rectangle', label: __('Rectangle') },
                  { value: 'Circle', label: __('Circle') },
                ]}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="is_take_away"
                checked={newTable.is_take_away}
                onCheckedChange={(checked) => setNewTable({ ...newTable, is_take_away: checked })}
              />
              <label htmlFor="is_take_away" className="text-sm font-medium text-foreground cursor-pointer">
                {__('Is Take Away Table')}
              </label>
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              {__('Cancel')}
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white shadow-sm" disabled={saving}>
              {editingTable ? __('Save Changes') : __('Save Table')}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default TablePage;
