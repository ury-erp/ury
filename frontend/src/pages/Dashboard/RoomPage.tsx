import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Plus, Layers, Edit2 } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast, DataTable, type DataTableColumn } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { Switch } from '../../components/ui/switch';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface UryRoomRecord {
  name: string;
  room_name?: string;
  room_type?: string;
  branch?: string;
  kot_printing?: number;
  print_format?: string;
  block_takeaway?: number;
}

export const RoomPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rooms, setRooms] = useState<UryRoomRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingRoom, setEditingRoom] = useState<UryRoomRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Branch options
  const [branches, setBranches] = useState<{ name: string }[]>([]);

  const [newRoom, setNewRoom] = useState({
    room_name: '',
    room_type: 'AC',
    branch: '',
    kot_printing: false,
    print_format: '',
    block_takeaway: false,
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
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<UryRoomRecord>('URY Room', activeBranchId);
      setRooms(records);
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchRooms();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingRoom(null);
    setNewRoom({
      room_name: '',
      room_type: 'AC',
      branch: activeBranchId !== 'all' ? activeBranchId : '',
      kot_printing: false,
      print_format: '',
      block_takeaway: false,
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (room: any) => {
    setEditingRoom(room);
    // Derive display name from room.name, stripping branch suffix if present
    let displayName = room.name;
    if (room.branch && displayName.endsWith(` - ${room.branch}`)) {
      displayName = displayName.substring(0, displayName.length - (` - ${room.branch}`).length);
    }
    setNewRoom({
      room_name: displayName,
      room_type: room.room_type || 'AC',
      branch: room.branch || '',
      kot_printing: room.kot_printing === 1,
      print_format: room.print_format || '',
      block_takeaway: room.block_takeaway === 1,
    });
    setIsDrawerOpen(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom && !newRoom.room_name) return;
    setSaving(true);
    try {
      if (editingRoom) {
        // Derive display name from room.name, stripping branch suffix if present
        let originalDisplayName = editingRoom.name;
        if (editingRoom.branch && originalDisplayName.endsWith(` - ${editingRoom.branch}`)) {
          originalDisplayName = originalDisplayName.substring(0, originalDisplayName.length - (` - ${editingRoom.branch}`).length);
        }

        const original = {
          room_name: originalDisplayName || '',
          room_type: editingRoom.room_type || 'AC',
          branch: editingRoom.branch || '',
          kot_printing: editingRoom.kot_printing === 1 ? 1 : 0,
          print_format: editingRoom.print_format || '',
          block_takeaway: editingRoom.block_takeaway === 1 ? 1 : 0,
        };
        const current = {
          room_name: newRoom.room_name || '',
          room_type: newRoom.room_type || 'AC',
          branch: newRoom.branch || '',
          kot_printing: newRoom.kot_printing ? 1 : 0,
          print_format: newRoom.print_format || '',
          block_takeaway: newRoom.block_takeaway ? 1 : 0,
        };
        if (JSON.stringify(original) === JSON.stringify(current)) {
          showToast.warning('No changes in document');
          setSaving(false);
          return;
        }

        let currentName = editingRoom.name;
        const newDocName = newRoom.branch ? `${newRoom.room_name} - ${newRoom.branch}` : newRoom.room_name;
        if (newDocName !== editingRoom.name) {
          await call('frappe.client.rename_doc', {
            doctype: 'URY Room',
            old_name: editingRoom.name,
            new_name: newDocName,
          });
          currentName = newDocName;
        }

        await call('frappe.client.set_value', {
          doctype: 'URY Room',
          name: currentName,
          fieldname: {
            room_type: newRoom.room_type,
            branch: newRoom.branch,
            kot_printing: newRoom.kot_printing ? 1 : 0,
            print_format: newRoom.print_format,
            block_takeaway: newRoom.block_takeaway ? 1 : 0,
          },
        });
      } else {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'URY Room',
            name: `${newRoom.room_name} - ${newRoom.branch}`,
            room_type: newRoom.room_type,
            branch: newRoom.branch || undefined,
            kot_printing: newRoom.kot_printing ? 1 : 0,
            print_format: newRoom.print_format,
            block_takeaway: newRoom.block_takeaway ? 1 : 0,
          },
        });
      }
      showToast.success('Room saved');
      fetchRooms();
      setIsDrawerOpen(false);
    } catch (err: any) {
      showToast.error(err.message || 'Failed to save room');
      console.error('Failed to save URY Room', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar — Partition Style, no title */}
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Room</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : rooms.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Rooms Configured</h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            Add dining rooms or zones to organize your tables.
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Room</span>
          </Button>
        </Card>
      ) : (
        <>
          {(() => {
            const roomColumns: DataTableColumn<UryRoomRecord>[] = [
              { key: 'name', header: 'Room Name' },
              {
                key: 'room_type',
                header: 'Room Type',
                render: (room) => (
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                    <Layers className="w-3 h-3 mr-1" />
                    {room.room_type === 'NON-AC' ? 'Non-AC' : (room.room_type || 'General')}
                  </Badge>
                ),
              },
              { key: 'branch', header: 'Branch', render: (room) => room.branch || 'Main' },
              {
                key: 'name',
                header: 'Actions',
                align: 'right',
                render: (room) => (
                  <Button variant="ghost" size="sm" onClick={() => openEditDrawer(room)} className="text-gray-500 hover:text-primary">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                ),
              },
            ];

            return <DataTable columns={roomColumns} rows={rooms} isLoading={loading} emptyMessage="No rooms configured." />;
          })()}
        </>
      )}

      {/* Add/Edit SideDrawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingRoom ? 'Edit Room' : 'Add Room'}
      >
        <form onSubmit={handleSaveRoom} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Room Name</label>
            <Input
              value={newRoom.room_name}
              onChange={(e) => setNewRoom({ ...newRoom, room_name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Room Type</label>
            <SearchableSelect
              id="room_type"
              value={newRoom.room_type}
              onChange={(_, value) => setNewRoom({ ...newRoom, room_type: value })}
              options={[
                { value: 'AC', label: 'AC' },
                { value: 'NON-AC', label: 'Non-AC' },
              ]}
            />
          </div>

          {/* Branch field */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Branch</label>
            <SearchableSelect
              id="branch"
              value={newRoom.branch}
              onChange={(_, value) => setNewRoom({ ...newRoom, branch: value })}
              options={[
                { value: '', label: 'Select Branch' },
                ...branches.map(b => ({ value: b.name, label: b.name }))
              ]}
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3">Printer Configuration</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="kot_printing"
                  checked={newRoom.kot_printing}
                  onCheckedChange={(checked) => setNewRoom({ ...newRoom, kot_printing: checked })}
                />
                <label htmlFor="kot_printing" className="text-gray-700 cursor-pointer">Enable KOT Printing for this room</label>
              </div>

              {newRoom.kot_printing && (
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Print Format</label>
                  <Input
                    value={newRoom.print_format}
                    onChange={(e) => setNewRoom({ ...newRoom, print_format: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  id="block_takeaway"
                  checked={newRoom.block_takeaway}
                  onCheckedChange={(checked) => setNewRoom({ ...newRoom, block_takeaway: checked })}
                />
                <label htmlFor="block_takeaway" className="text-gray-700 cursor-pointer">Block Takeaway / Delivery Printing</label>
              </div>
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              {editingRoom ? 'Save Changes' : 'Save Room'}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default RoomPage;
