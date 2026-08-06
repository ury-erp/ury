import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, DoorOpen } from 'lucide-react';
import { SearchableSelect } from '../SearchableSelect';

export function RoomSection() {
  const { rooms, branch, addRoom, updateRoom, deleteRoom } = useConfigure();

  const handleAdd = () => {
    addRoom({
      name: '',
      type: 'AC',
      branch: branch.branchName || '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Header Row */}
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-[#4B5563]">
          <div className="flex-1">Room Name</div>
          <div className="flex-1">Room Type</div>
          <div className="flex-1">Branch</div>
          {rooms.length > 1 && <div className="w-8"></div>}
        </div>

        {rooms.map((room, index) => (
          <div
            key={room.id}
            className="py-2 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Input
                  type="text"
                  value={room.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRoom(room.id, { name: e.target.value })}
                  placeholder="Room Name"
                  className="w-full text-sm bg-white"
                />
              </div>

              <div>
                <SearchableSelect
                  id={`room-type-${room.id}`}
                  value={room.type}
                  options={[
                    { value: 'AC', label: 'AC' },
                    { value: 'NON-AC', label: 'NON-AC' },
                  ]}
                  onChange={(_, val) => updateRoom(room.id, { type: val })}
                />
              </div>

              <div>
                <Input
                  type="text"
                  value={room.branch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRoom(room.id, { branch: e.target.value })}
                  placeholder="Branch Name"
                  className="w-full text-sm bg-white"
                />
              </div>
            </div>

            {rooms.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => deleteRoom(room.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center shrink-0 p-2 h-auto"
                title="Delete Room"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full py-2.5 border-dashed border-[#2B5CE6] text-[#2B5CE6] hover:bg-[#EFF4FF] flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Room
      </Button>
    </div>
  );
}
