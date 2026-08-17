import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Plus, Layers, Edit2 } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner } from '@ury/ui';
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
    setNewRoom({
      room_name: room.room_name || '',
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
    if (!newRoom.room_name) return;
    try {
      if (editingRoom) {
        await call('frappe.client.set_value', {
          doctype: 'URY Room',
          name: editingRoom.name,
          fieldname: {
            room_name: newRoom.room_name,
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
            name: newRoom.room_name,
            room_name: newRoom.room_name,
            room_type: newRoom.room_type,
            branch: newRoom.branch || undefined,
            kot_printing: newRoom.kot_printing ? 1 : 0,
            print_format: newRoom.print_format,
            block_takeaway: newRoom.block_takeaway ? 1 : 0,
          },
        });
      }
      fetchRooms();
      setIsDrawerOpen(false);
    } catch (err) {
      console.error('Failed to save URY Room', err);
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
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-4">Room Name</th>
                <th className="px-6 py-4">Room Type</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rooms.map((room) => (
                <tr key={room.name} className="hover:bg-primary/10 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">{room.room_name || room.name}</td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                      <Layers className="w-3 h-3 mr-1" />
                      {room.room_type || 'General'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">{room.branch || 'Main'}</td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEditDrawer(room)} className="text-gray-500 hover:text-primary">
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
                { value: 'Non-AC', label: 'Non-AC' },
                { value: 'Rooftop', label: 'Rooftop' },
                { value: 'Outdoor', label: 'Outdoor' },
                { value: 'Bar', label: 'Bar' },
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
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={newRoom.kot_printing}
                  onChange={(e) => setNewRoom({ ...newRoom, kot_printing: e.target.checked })}
                  className="rounded text-primary border-gray-300 focus:ring-primary"
                />
                <span className="text-gray-700">Enable KOT Printing for this room</span>
              </label>

              {newRoom.kot_printing && (
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Print Format</label>
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
                  className="rounded text-primary border-gray-300 focus:ring-primary"
                />
                <span className="text-gray-700">Block Takeaway / Delivery Printing</span>
              </label>
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
              {editingRoom ? 'Save Changes' : 'Save Room'}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default RoomPage;
