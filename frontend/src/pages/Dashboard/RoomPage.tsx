import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Plus, Layers, Edit2 } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface UryRoomRecord {
  name: string;
  room_name?: string;
  room_type?: string;
  branch?: string;
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
        await call('frappe.client.set_value', {
          doctype: 'URY Room',
          name: editingRoom.name,
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
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Room</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : rooms.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No Rooms Configured</h3>
          <p className="text-text-tertiary mb-6 max-w-sm">
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
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted border-b border-border text-xs uppercase text-text-tertiary font-semibold">
              <tr>
                <th className="px-6 py-4">Room Name</th>
                <th className="px-6 py-4">Room Type</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {rooms.map((room) => (
                <tr key={room.name} className="hover:bg-primary/10 transition-colors">
                  <td className="px-6 py-4 font-semibold text-foreground">{room.name}</td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                      <Layers className="w-3 h-3 mr-1" />
                      {room.room_type || 'General'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">{room.branch || 'Main'}</td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEditDrawer(room)} className="text-text-tertiary hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit SideDrawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingRoom ? 'Edit Room' : 'Add Room'}
      >
        <form onSubmit={handleSaveRoom} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Room Name</label>
            <Input
              value={newRoom.room_name}
              onChange={(e) => setNewRoom({ ...newRoom, room_name: e.target.value })}
              disabled={!!editingRoom}
              required={!editingRoom}
            />
            {editingRoom && (
              <p className="text-xs text-text-tertiary mt-1">Room name cannot be changed after creation</p>
            )}
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Room Type</label>
            <SearchableSelect
              id="room_type"
              value={newRoom.room_type}
              onChange={(_, value) => setNewRoom({ ...newRoom, room_type: value })}
              options={[
                { value: 'AC', label: 'AC' },
                { value: 'Non-AC', label: 'Non-AC' },
                { value: 'Rooftop', label: 'Rooftop' },
                { value: 'Outdoor', label: 'Outdoor' },
                { value: 'Bar', label: 'Bar' },
              ]}
            />
          </div>

          {/* Branch field */}
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Branch</label>
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

          <div className="pt-4 border-t border-border">
            <h3 className="font-semibold text-foreground mb-3">Printer Configuration</h3>
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={newRoom.kot_printing}
                  onChange={(e) => setNewRoom({ ...newRoom, kot_printing: e.target.checked })}
                  className="rounded text-primary border-border focus:ring-primary"
                />
                <span className="text-muted-foreground">Enable KOT Printing for this room</span>
              </label>

              {newRoom.kot_printing && (
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">Print Format</label>
                  <Input
                    value={newRoom.print_format}
                    onChange={(e) => setNewRoom({ ...newRoom, print_format: e.target.value })}
                  />
                </div>
              )}

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={newRoom.block_takeaway}
                  onChange={(e) => setNewRoom({ ...newRoom, block_takeaway: e.target.checked })}
                  className="rounded text-primary border-border focus:ring-primary"
                />
                <span className="text-muted-foreground">Block Takeaway / Delivery Printing</span>
              </label>
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-border">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null}
              {editingRoom ? 'Save Changes' : 'Save Room'}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default RoomPage;
