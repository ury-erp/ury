import React, { useEffect, useState } from 'react';
import { X, Square, AlertTriangle } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { getRooms, getTables, Room, Table } from '../lib/table-api';
import { Badge } from './ui/badge';
import { Spinner } from './ui/spinner';
import { TableShapeIcon } from './TableShapeIcon';

interface Props {
  onClose: () => void;
}

const TableSelectionDialog: React.FC<Props> = ({ onClose }) => {
  const { selectedTable, setSelectedTable, posProfile } = usePOSStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesCache, setTablesCache] = useState<Record<string, Table[]>>({});
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortTables = (tables: Table[]): Table[] => {
    return [...tables].sort((a, b) => a.name.localeCompare(b.name));
  };

  // Fetch rooms on mount with session storage
  useEffect(() => {
    async function fetchRooms() {
      if (!posProfile?.branch) return;
      setLoadingRooms(true);
      setError(null);

      try {
        // Try to get rooms from session storage first
        const sessionKey = `ury_rooms_${posProfile.branch}`;
        const cachedRooms = sessionStorage.getItem(sessionKey);
        
        if (cachedRooms) {
          const parsedRooms = JSON.parse(cachedRooms) as Room[];
          setRooms(parsedRooms);
          if (parsedRooms.length > 0) {
            setSelectedRoom(parsedRooms[0].name);
          }
        } else {
          // If not in session storage, fetch from API
          const fetchedRooms = await getRooms(posProfile.branch);
          setRooms(fetchedRooms);
          if (fetchedRooms.length > 0) {
            setSelectedRoom(fetchedRooms[0].name);
          }
          // Store in session storage
          sessionStorage.setItem(sessionKey, JSON.stringify(fetchedRooms));
        }
      } catch (e) {
        setError('Failed to load rooms');
      } finally {
        setLoadingRooms(false);
      }
    }
    fetchRooms();
  }, [posProfile?.branch]);

  // Fetch tables when selectedRoom changes, but cache per room
  useEffect(() => {
    async function fetchTables() {
      if (!selectedRoom) return;
      setError(null);
      // If already cached, use cache
      if (tablesCache[selectedRoom]) {
        setTables(sortTables(tablesCache[selectedRoom]));
        setLoadingTables(false);
        return;
      }
      setLoadingTables(true);
      try {
        const fetchedTables = await getTables(selectedRoom);
        const sortedTables = sortTables(fetchedTables);
        setTables(sortedTables);
        setTablesCache(prev => ({ ...prev, [selectedRoom]: fetchedTables }));
      } catch (e) {
        setError('Failed to load tables');
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    }
    fetchTables();
  }, [selectedRoom]);

  // Clear cache when modal closes
  useEffect(() => {
    if (!selectedRoom) {
      setTablesCache({});
    }
  }, [onClose]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-lg w-full h-5/6 max-w-2xl mx-auto p-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Select Table</h2>
          <Button onClick={onClose} variant="ghost" size="icon">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-4">
          {/* Room Selection */}
          {loadingRooms ? (
            <div className="mb-6">
              <Spinner message="Loading rooms..." />
            </div>
          ) : error ? (
            <div className="mb-6 flex flex-col items-center justify-center gap-2 text-red-500">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span>{error}</span>
            </div>
          ) : rooms.length === 0 ? (
            <div className="mb-6 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Square className="w-8 h-8 mb-1" />
              <span>No rooms found</span>
            </div>
          ) : (
            <div className="flex gap-2 mb-6">
              {rooms.map(room => (
                <Button
                  key={room.name}
                  onClick={() => setSelectedRoom(room.name)}
                  variant="tab"
                  data-selected={selectedRoom === room.name}
                  className="h-fit"
                >
                  {room.name}
                </Button>
              ))}
            </div>
          )}

          {/* Table Grid */}
          {loadingTables ? (
            <div className="">
              <Spinner message="Loading tables..." />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 text-red-500 mt-8">
              <AlertTriangle className="w-8 h-8 mb-1" />
              <span>{error}</span>
            </div>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-gray-400 mt-8">
              <Square className="w-8 h-8 mb-1" />
              <span>No tables found</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {tables.map(table => (
                <Button
                  key={table.name}
                  onClick={() => {
                    setSelectedTable(table.name, selectedRoom);
                    onClose();
                  }}
                  variant="outline"
                  className={cn(
                    'h-fit p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors relative',
                    selectedTable === table.name
                      ? 'border-primary-600 bg-primary-50'
                      : table.occupied === 1
                      ? 'border-amber-500 bg-amber-50 hover:border-amber-600 hover:bg-amber-100'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
                    'focus-visible:ring-2 focus-visible:ring-primary-600',
                  )}
                >
                  <TableShapeIcon
                    shape={table.table_shape}
                    className={cn(
                      'w-8 h-8',
                      table.occupied === 1 ? 'text-amber-500' : 'text-gray-500'
                    )}
                  />
                  <div className="text-center">
                    <div className="font-medium">{table.name}</div>
                    <div className="mt-2 h-4"> {/* Height placeholder that matches Badge height */}
                      {table.occupied === 1 && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
                          Occupied
                        </Badge>
                      )}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TableSelectionDialog; 