import React, { useEffect, useState } from 'react';
import { useConfigure, TableData } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2 } from 'lucide-react';

interface PendingShrink {
  newCount: number;
  tables: TableData[];
}

interface RoomRowProps {
  room: { id: string; name: string; tableCount: number; prefix: string };
  canDelete: boolean;
  renameRoom: (id: string, newName: string) => void;
  deleteRoom: (id: string) => void;
  previewShrink: (roomId: string, newCount: number) => TableData[];
  setRoomTableCount: (roomId: string, newCount: number, confirmedRemovalIds?: string[]) => void;
}

function RoomRow({ room, canDelete, renameRoom, deleteRoom, previewShrink, setRoomTableCount }: RoomRowProps) {
  const [nameDraft, setNameDraft] = useState(room.name);
  const [countDraft, setCountDraft] = useState(String(room.tableCount));
  const [pendingShrink, setPendingShrink] = useState<PendingShrink | null>(null);

  // Keep local drafts in sync when the underlying room changes from elsewhere
  // (e.g. after a confirmed shrink applies and room.tableCount updates).
  useEffect(() => {
    setNameDraft(room.name);
  }, [room.name]);

  useEffect(() => {
    setCountDraft(String(room.tableCount));
  }, [room.tableCount]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed !== room.name) {
      renameRoom(room.id, trimmed);
    } else {
      setNameDraft(room.name);
    }
  };

  const commitCount = () => {
    const newCount = Math.max(0, parseInt(countDraft, 10) || 0);
    if (newCount === room.tableCount) {
      setCountDraft(String(room.tableCount));
      return;
    }
    const removed = previewShrink(room.id, newCount);
    if (removed.length === 0) {
      setRoomTableCount(room.id, newCount);
    } else {
      setPendingShrink({ newCount, tables: removed });
    }
  };

  const confirmRemove = () => {
    if (!pendingShrink) return;
    setRoomTableCount(
      room.id,
      pendingShrink.newCount,
      pendingShrink.tables.map((t) => t.id)
    );
    setPendingShrink(null);
  };

  const cancelRemove = () => {
    setCountDraft(String(room.tableCount));
    setPendingShrink(null);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 md:items-end">
        <div className="space-y-1.5">
          <label htmlFor={`room-name-${room.id}`} className="text-xs font-medium text-muted-foreground">
            Room Name
          </label>
          <Input
            id={`room-name-${room.id}`}
            type="text"
            value={nameDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameDraft(e.target.value)}
            onBlur={commitName}
            placeholder="e.g. Main Dining, Rooftop"
            className="w-full text-sm bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`room-count-${room.id}`} className="text-xs font-medium text-muted-foreground">
            Number of Tables
          </label>
          <Input
            id={`room-count-${room.id}`}
            type="number"
            min={0}
            value={countDraft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCountDraft(e.target.value)}
            onBlur={commitCount}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-full text-sm bg-background"
          />
        </div>

        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => deleteRoom(room.id)}
            aria-label="Delete room"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 p-2 h-auto justify-self-end"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        We'll name your tables automatically — you can rename or adjust any of them after.
      </p>

      {pendingShrink && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <p className="text-sm text-amber-900">
            Remove {pendingShrink.tables.map((t) => t.name).join(' and ')}? This can't be undone.
          </p>
          <div className="flex gap-2 shrink-0">
            <Button type="button" variant="ghost" size="sm" onClick={cancelRemove}>
              Cancel
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={confirmRemove}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoomSection() {
  const { rooms, addRoom, renameRoom, deleteRoom, previewShrink, setRoomTableCount } = useConfigure();

  const handleAdd = () => {
    addRoom('', 1);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        A room is any distinct seating area — dining hall, rooftop, private room. Most restaurants just need one to
        start.
      </p>

      <div className="space-y-3">
        {rooms.map((room) => (
          <RoomRow
            key={room.id}
            room={room}
            canDelete={rooms.length > 1}
            renameRoom={renameRoom}
            deleteRoom={deleteRoom}
            previewShrink={previewShrink}
            setRoomTableCount={setRoomTableCount}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full py-2.5 border-dashed border-primary text-primary hover:bg-primary/5 flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Room
      </Button>
    </div>
  );
}
