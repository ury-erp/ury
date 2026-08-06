import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, LayoutGrid } from 'lucide-react';
import { SearchableSelect } from '../SearchableSelect';

export function TableSection() {
  const { tables, rooms, branch, addTable, updateTable, deleteTable } = useConfigure();

  const handleAdd = () => {
    addTable({
      name: '',
      seats: 0,
      branch: branch.branchName || '',
      room: rooms[0]?.name || '',
      shape: 'Square',
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Header Row */}
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-[#4B5563]">
          <div className="flex-1">Table Name</div>
          <div className="flex-1">Seats</div>
          <div className="flex-1">Room</div>
          <div className="flex-1">Shape</div>
          {tables.length > 1 && <div className="w-8"></div>}
        </div>

        {tables.map((table, index) => (
          <div
            key={table.id}
            className="py-2 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Input
                  type="text"
                  value={table.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTable(table.id, { name: e.target.value })}
                  placeholder="e.g. T-01"
                  className="w-full text-sm bg-white"
                />
              </div>

              <div>
                <Input
                  type="number"
                  min={1}
                  value={table.seats || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTable(table.id, { seats: parseInt(e.target.value, 10) || 0 })}
                  placeholder="Seats"
                  className="w-full text-sm bg-white"
                />
              </div>

              <div>
                <SearchableSelect
                  id={`table-room-${table.id}`}
                  value={table.room}
                  options={
                    rooms.length > 0
                      ? rooms.map((r) => ({ value: r.name, label: r.name }))
                      : [{ value: 'Main Dining', label: 'Main Dining' }]
                  }
                  onChange={(_, val) => updateTable(table.id, { room: val })}
                />
              </div>

              <div>
                <SearchableSelect
                  id={`table-shape-${table.id}`}
                  value={table.shape}
                  options={[
                    { value: 'Square', label: 'Square' },
                    { value: 'Rectangle', label: 'Rectangle' },
                    { value: 'Round', label: 'Round' },
                  ]}
                  onChange={(_, val) => updateTable(table.id, { shape: val as 'Square' | 'Rectangle' | 'Round' })}
                />
              </div>
            </div>

            {tables.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => deleteTable(table.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center shrink-0 p-2 h-auto"
                title="Delete Table"
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
        Add Table
      </Button>
    </div>
  );
}
