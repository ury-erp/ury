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

interface PrinterSetting {
  name?: string; // Frappe's document name for existing child rows
  bill: number;
  printer: string;
}

export const RoomPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rooms, setRooms] = useState<UryRoomRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingRoom, setEditingRoom] = useState<UryRoomRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [originalRoomDisplayName, setOriginalRoomDisplayName] = useState<string>('');

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

  const [printerSettings, setPrinterSettings] = useState<PrinterSetting[]>([]);
  const [networkPrinters, setNetworkPrinters] = useState<{ name: string }[]>([]);

  const fetchBranches = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('Branch', 'all');
      setBranches(res || []);
    } catch {
      setBranches([]);
    }
  };

  const fetchNetworkPrinters = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('Network Printer Settings', 'all');
      setNetworkPrinters(res || []);
    } catch {
      setNetworkPrinters([]);
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
    fetchNetworkPrinters();
    fetchRooms();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingRoom(null);
    setOriginalRoomDisplayName('');
    setNewRoom({
      room_name: '',
      room_type: 'AC',
      branch: activeBranchId !== 'all' ? activeBranchId : '',
      kot_printing: false,
      print_format: '',
      block_takeaway: false,
    });
    setPrinterSettings([]);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = async (room: any) => {
    setEditingRoom(room);
    // Derive display name from room.name, stripping branch suffix if present
    let displayName = room.name;
    if (room.branch && displayName.endsWith(` - ${room.branch}`)) {
      displayName = displayName.substring(0, displayName.length - (` - ${room.branch}`).length);
    }
    // Store the original display name to use for rename detection later
    setOriginalRoomDisplayName(displayName);
    setNewRoom({
      room_name: displayName,
      room_type: room.room_type || 'AC',
      branch: room.branch || '',
      kot_printing: room.kot_printing === 1,
      print_format: room.print_format || '',
      block_takeaway: room.block_takeaway === 1,
    });

    // Fetch full document including printer_settings child table
    try {
      const response = await call('frappe.client.get', {
        doctype: 'URY Room',
        name: room.name,
      });
      const fullDoc = response.message || response;
      setPrinterSettings(fullDoc.printer_settings || []);
    } catch (err) {
      console.error('Failed to fetch full room document', err);
      setPrinterSettings([]);
    }

    setIsDrawerOpen(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom && !newRoom.room_name) return;
    setSaving(true);
    try {
      if (editingRoom) {
        // Use the stored original display name (captured when drawer opened) for accurate comparison.
        // This avoids issues where reconstructing the name from stored values could fail due to
        // whitespace differences in the branch field or other formatting edge cases.
        const original = {
          room_name: originalRoomDisplayName || '',
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
        // Only rename if the user actually changed the room name field
        if (newRoom.room_name !== originalRoomDisplayName) {
          // Construct new and old document names consistently using the stored display name
          const oldDocName = editingRoom.branch ? `${originalRoomDisplayName} - ${editingRoom.branch}` : originalRoomDisplayName;
          const newDocName = newRoom.branch ? `${newRoom.room_name} - ${newRoom.branch}` : newRoom.room_name;

          if (newDocName !== oldDocName) {
            await call('frappe.client.rename_doc', {
              doctype: 'URY Room',
              old_name: editingRoom.name,
              new_name: newDocName,
            });
            currentName = newDocName;
          }
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
            printer_settings: printerSettings,
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
            printer_settings: [],
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

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Printer Settings</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setPrinterSettings([...printerSettings, { bill: 1, printer: '' }]);
                }}
                className="text-primary border-primary"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>

            {printerSettings.length === 0 ? (
              <p className="text-sm text-gray-500 py-3">No printer settings configured</p>
            ) : (
              <div className="space-y-3">
                {printerSettings.map((setting, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <Switch
                        checked={setting.bill === 1}
                        onCheckedChange={(checked) => {
                          const updated = [...printerSettings];
                          updated[idx].bill = checked ? 1 : 0;
                          setPrinterSettings(updated);
                        }}
                      />
                      <label className="text-sm text-gray-700 cursor-pointer">Bill</label>
                    </div>

                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        id={`printer_${idx}`}
                        value={setting.printer}
                        onChange={(_, value) => {
                          const updated = [...printerSettings];
                          updated[idx].printer = value;
                          setPrinterSettings(updated);
                        }}
                        options={[
                          { value: '', label: 'Select Printer' },
                          ...networkPrinters.map(p => ({ value: p.name, label: p.name }))
                        ]}
                      />
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPrinterSettings(printerSettings.filter((_, i) => i !== idx));
                      }}
                      className="text-red-500 hover:text-red-700 flex-shrink-0"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
