import React, { useEffect, useRef, useState } from 'react';
import { useConfigure, RoomData, TableData } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

/** Below this total, there's no real "many tables" problem yet , leave every group open. */
const COLLAPSE_THRESHOLD = 10;

function computeInitialExpanded(rooms: RoomData[], tables: TableData[]): Set<string> {
  if (rooms.length <= 1) return new Set(rooms.map((r) => r.id));
  if (tables.length < COLLAPSE_THRESHOLD) return new Set(rooms.map((r) => r.id));
  // Many tables across several rooms , only the first room starts expanded.
  return new Set(rooms[0] ? [rooms[0].id] : []);
}

interface TableRowProps {
  table: TableData;
  renameTable: (id: string, name: string) => void;
  updateTableSeats: (id: string, seats: number) => void;
  deleteTable: (id: string) => void;
  canDelete: boolean;
}

function TableRow({ table, renameTable, updateTableSeats, deleteTable, canDelete }: TableRowProps) {
  const [nameDraft, setNameDraft] = useState(table.name);

  useEffect(() => {
    setNameDraft(table.name);
  }, [table.name]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== table.name) {
      renameTable(table.id, trimmed);
    } else {
      setNameDraft(table.name);
    }
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 py-2">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={`table-name-${table.id}`} className="sr-only">
            Table name
          </label>
          <Input
            id={`table-name-${table.id}`}
            type="text"
            value={nameDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameDraft(e.target.value)}
            onBlur={commitName}
            placeholder="e.g. T-01"
            className="w-full text-sm bg-background"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={`table-seats-${table.id}`} className="sr-only">
            Seats
          </label>
          <Input
            id={`table-seats-${table.id}`}
            type="number"
            min={1}
            value={table.seats || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateTableSeats(table.id, parseInt(e.target.value, 10) || 0)
            }
            placeholder="Seats"
            className="w-full text-sm bg-background"
          />
        </div>
      </div>

      {canDelete && (
        <Button
          type="button"
          variant="danger"
          size="icon"
          onClick={() => deleteTable(table.id)}
          aria-label="Delete table"
          className="self-end md:self-center shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

interface RoomGroupProps {
  room: RoomData;
  roomTables: TableData[];
  totalTables: number;
  expanded: boolean;
  onToggle: () => void;
  renameTable: (id: string, name: string) => void;
  updateTableSeats: (id: string, seats: number) => void;
  setSeatsForRoom: (roomId: string, seats: number) => void;
  deleteTable: (id: string) => void;
}

function RoomGroup({
  room,
  roomTables,
  totalTables,
  expanded,
  onToggle,
  renameTable,
  updateTableSeats,
  setSeatsForRoom,
  deleteTable,
}: RoomGroupProps) {
  const [bulkSeats, setBulkSeats] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  const applyBulkSeats = () => {
    const seats = parseInt(bulkSeats, 10);
    if (!seats || seats <= 0 || roomTables.length === 0) return;
    setSeatsForRoom(room.id, seats);
    setFlash(`Set ${roomTables.length} table${roomTables.length === 1 ? '' : 's'} to ${seats} seats`);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlash(null), 3000);
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 bg-muted/50">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-left text-sm font-semibold text-foreground flex-1 min-w-0"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{room.name || 'Untitled room'}</span>
          <span className="text-xs font-normal text-muted-foreground shrink-0">
            {roomTables.length} table{roomTables.length === 1 ? '' : 's'}
          </span>
        </button>

        {roomTables.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            {flash && <span className="text-xs text-primary">{flash}</span>}
            <label htmlFor={`bulk-seats-${room.id}`} className="sr-only">
              Set seats for all tables in {room.name}
            </label>
            <Input
              id={`bulk-seats-${room.id}`}
              type="number"
              min={1}
              value={bulkSeats}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBulkSeats(e.target.value)}
              placeholder="Seats"
              className="w-20 text-sm bg-background"
            />
            <Button type="button" variant="outline" size="sm" onClick={applyBulkSeats}>
              Set seats for all
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="p-4 pt-2 space-y-1 divide-y divide-border">
          {roomTables.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No tables yet , set a table count for this room in the Rooms section to add tables here.
            </p>
          ) : (
            roomTables.map((table) => (
              <TableRow
                key={table.id}
                table={table}
                renameTable={renameTable}
                updateTableSeats={updateTableSeats}
                deleteTable={deleteTable}
                canDelete={totalTables > 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TableSection() {
  const { rooms, tables, renameTable, updateTableSeats, setSeatsForRoom, deleteTable } = useConfigure();
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(() => computeInitialExpanded(rooms, tables));

  const toggleRoom = (roomId: string) => {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  };

  const roomNames = new Set(rooms.map((r) => r.name));
  const orphanTables = tables.filter((t) => !roomNames.has(t.room));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {rooms.map((room) => (
          <RoomGroup
            key={room.id}
            room={room}
            roomTables={tables.filter((t) => t.room === room.name)}
            totalTables={tables.length}
            expanded={expandedRoomIds.has(room.id)}
            onToggle={() => toggleRoom(room.id)}
            renameTable={renameTable}
            updateTableSeats={updateTableSeats}
            setSeatsForRoom={setSeatsForRoom}
            deleteTable={deleteTable}
          />
        ))}

        {orphanTables.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-1 divide-y divide-border">
            <p className="text-xs font-medium text-muted-foreground pb-2">Other tables</p>
            {orphanTables.map((table) => (
              <TableRow
                key={table.id}
                table={table}
                renameTable={renameTable}
                updateTableSeats={updateTableSeats}
                deleteTable={deleteTable}
                canDelete={tables.length > 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
