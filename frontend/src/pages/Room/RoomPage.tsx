import { useState, useMemo } from 'react';
import {
  Button,
  Input,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@ury/ui';
import Drawer from '../../components/common/Drawer';
import {
  Search,
  Plus,
  DoorOpen,
  Printer,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  Building,
  CheckCircle,
  XCircle,
  Grid,
  FileText,
  Sliders,
} from 'lucide-react';

export type RoomType = 'Indoor' | 'Outdoor' | 'Rooftop' | 'Private Dining' | 'Bar Area';
export type PrintFormat = 'Standard KOT' | 'Detailed KOT' | 'Bar Ticket' | 'Kitchen Display';

export interface PrinterConfig {
  kot_printing: boolean;
  print_format: PrintFormat;
  block_takeaway_printing: boolean;
}

export interface RoomData {
  id: string;
  room_name: string;
  room_type: RoomType;
  branch: string;
  number_of_tables: number;
  printer_config: PrinterConfig;
}

const INITIAL_ROOMS: RoomData[] = [
  {
    id: 'room-1',
    room_name: 'Main Hall',
    room_type: 'Indoor',
    branch: 'Main Branch',
    number_of_tables: 12,
    printer_config: {
      kot_printing: true,
      print_format: 'Standard KOT',
      block_takeaway_printing: false,
    },
  },
  {
    id: 'room-2',
    room_name: 'Terrace Garden',
    room_type: 'Outdoor',
    branch: 'Main Branch',
    number_of_tables: 8,
    printer_config: {
      kot_printing: true,
      print_format: 'Detailed KOT',
      block_takeaway_printing: true,
    },
  },
  {
    id: 'room-3',
    room_name: 'VIP Executive Lounge',
    room_type: 'Private Dining',
    branch: 'Downtown Branch',
    number_of_tables: 4,
    printer_config: {
      kot_printing: true,
      print_format: 'Detailed KOT',
      block_takeaway_printing: true,
    },
  },
  {
    id: 'room-4',
    room_name: 'Sky Deck',
    room_type: 'Rooftop',
    branch: 'Beachfront Outpost',
    number_of_tables: 6,
    printer_config: {
      kot_printing: true,
      print_format: 'Bar Ticket',
      block_takeaway_printing: false,
    },
  },
];

const ROOM_TYPES: RoomType[] = ['Indoor', 'Outdoor', 'Rooftop', 'Private Dining', 'Bar Area'];
const BRANCHES = ['All Branches', 'Main Branch', 'Downtown Branch', 'Beachfront Outpost'];
const PRINT_FORMATS: PrintFormat[] = ['Standard KOT', 'Detailed KOT', 'Bar Ticket', 'Kitchen Display'];

export default function RoomPage() {
  const [rooms, setRooms] = useState<RoomData[]>(INITIAL_ROOMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomData | null>(null);

  // Form State
  const [formRoomName, setFormRoomName] = useState('');
  const [formRoomType, setFormRoomType] = useState<RoomType>('Indoor');
  const [formBranch, setFormBranch] = useState('Main Branch');
  const [formNumTables, setFormNumTables] = useState(0);

  // Printer Config State
  const [isPrinterConfigOpen, setIsPrinterConfigOpen] = useState(false);
  const [formKotPrinting, setFormKotPrinting] = useState(true);
  const [formPrintFormat, setFormPrintFormat] = useState<PrintFormat>('Standard KOT');
  const [formBlockTakeawayPrinting, setFormBlockTakeawayPrinting] = useState(false);

  const openAddDrawer = () => {
    setEditingRoom(null);
    setFormRoomName('');
    setFormRoomType('Indoor');
    setFormBranch('Main Branch');
    setFormNumTables(0);
    setFormKotPrinting(true);
    setFormPrintFormat('Standard KOT');
    setFormBlockTakeawayPrinting(false);
    setIsPrinterConfigOpen(false);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (room: RoomData) => {
    setEditingRoom(room);
    setFormRoomName(room.room_name);
    setFormRoomType(room.room_type);
    setFormBranch(room.branch);
    setFormNumTables(room.number_of_tables);
    setFormKotPrinting(room.printer_config.kot_printing);
    setFormPrintFormat(room.printer_config.print_format);
    setFormBlockTakeawayPrinting(room.printer_config.block_takeaway_printing);
    setIsPrinterConfigOpen(false);
    setIsDrawerOpen(true);
  };

  const handleSaveRoom = () => {
    if (!formRoomName.trim()) return;

    if (editingRoom) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === editingRoom.id
            ? {
                ...r,
                room_name: formRoomName,
                room_type: formRoomType,
                branch: formBranch,
                number_of_tables: formNumTables,
                printer_config: {
                  kot_printing: formKotPrinting,
                  print_format: formPrintFormat,
                  block_takeaway_printing: formBlockTakeawayPrinting,
                },
              }
            : r
        )
      );
    } else {
      const newRoom: RoomData = {
        id: `room-${Date.now()}`,
        room_name: formRoomName,
        room_type: formRoomType,
        branch: formBranch,
        number_of_tables: formNumTables,
        printer_config: {
          kot_printing: formKotPrinting,
          print_format: formPrintFormat,
          block_takeaway_printing: formBlockTakeawayPrinting,
        },
      };
      setRooms((prev) => [newRoom, ...prev]);
    }
    setIsDrawerOpen(false);
  };

  const handleDeleteRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  };

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        searchQuery === '' ||
        room.room_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.room_type.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesBranch = selectedBranch === 'All Branches' || room.branch === selectedBranch;

      return matchesSearch && matchesBranch;
    });
  }, [rooms, searchQuery, selectedBranch]);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <DoorOpen className="w-7 h-7 text-[#7C3AED]" />
            Room Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure dining rooms, seating zones, branch assignments, and KOT printer routing rules.
          </p>
        </div>

        <Button
          onClick={openAddDrawer}
          className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-sm self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Room
        </Button>
      </div>

      {/* Toolbar: Search & Branch Filter */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search room name or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-50/50 border-gray-200 focus:border-[#7C3AED]"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          >
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Room Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRooms.map((room) => (
          <Card
            key={room.id}
            className="rounded-xl border border-gray-200 bg-white hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
          >
            <CardHeader className="p-5 border-b border-gray-100 bg-gray-50/30 flex flex-row items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-[#7C3AED]" />
                  <CardTitle className="text-lg font-bold text-gray-900">
                    {room.room_name}
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-gray-500 mt-1">
                  {room.branch}
                </CardDescription>
              </div>

              <Badge variant="info" className="text-xs">
                {room.room_type}
              </Badge>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {/* Tables count metric */}
              <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-900 flex items-center gap-1.5">
                  <Grid className="w-4 h-4 text-[#7C3AED]" />
                  Assigned Tables
                </span>
                <span className="text-sm font-extrabold text-[#7C3AED]">
                  {room.number_of_tables} Tables
                </span>
              </div>

              {/* Printer summary */}
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-medium text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5 text-gray-500" />
                    KOT Printing:
                  </span>
                  <span
                    className={
                      room.printer_config.kot_printing
                        ? 'text-green-600 font-bold'
                        : 'text-gray-400 font-normal'
                    }
                  >
                    {room.printer_config.kot_printing ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-500 text-[11px]">
                  <span>Print Format:</span>
                  <span className="font-semibold text-gray-700">
                    {room.printer_config.print_format}
                  </span>
                </div>
                {room.printer_config.block_takeaway_printing && (
                  <div className="text-[11px] text-orange-600 font-medium">
                    Block Takeaway Printing Active
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="p-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditDrawer(room)}
                className="gap-1.5 text-xs border-gray-200 text-gray-700 hover:bg-purple-50 hover:text-[#7C3AED]"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit Room
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteRoom(room.id)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 h-auto"
                title="Delete Room"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Slide-over Drawer for Add/Edit Room */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingRoom ? 'Edit Room Configuration' : 'Add New Room'}
        subtitle="Configure general room details and printer KOT routing behavior."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRoom}
              className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
            >
              Save Room Configuration
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* General Room details */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
              General Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Room Name *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Outdoor Patio"
                  value={formRoomName}
                  onChange={(e) => setFormRoomName(e.target.value)}
                  className="w-full bg-white border-gray-200 focus:border-[#7C3AED]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Room Type *
                </label>
                <select
                  value={formRoomType}
                  onChange={(e) => setFormRoomType(e.target.value as RoomType)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                >
                  {ROOM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Branch *</label>
                <select
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                >
                  {BRANCHES.filter((b) => b !== 'All Branches').map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Number of Tables
                </label>
                <Input
                  type="number"
                  min={0}
                  value={formNumTables}
                  onChange={(e) => setFormNumTables(parseInt(e.target.value) || 0)}
                  className="w-full bg-white border-gray-200 focus:border-[#7C3AED]"
                />
              </div>
            </div>
          </div>

          {/* Collapsible Printer Configuration Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsPrinterConfigOpen(!isPrinterConfigOpen)}
              className="w-full p-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100/60 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-[#7C3AED]" />
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Printer Configuration</h4>
                  <p className="text-[11px] text-gray-500">
                    Configure KOT printing toggles, ticket layout formats, and takeaway restrictions
                  </p>
                </div>
              </div>
              {isPrinterConfigOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {isPrinterConfigOpen && (
              <div className="p-5 border-t border-gray-100 bg-white space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <span className="text-xs font-semibold text-gray-900 block">
                      Enable KOT Printing
                    </span>
                    <span className="text-[11px] text-gray-500">
                      Automatically route Kitchen Order Tickets for orders in this room
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formKotPrinting}
                    onChange={(e) => setFormKotPrinting(e.target.checked)}
                    className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Print Format
                  </label>
                  <select
                    value={formPrintFormat}
                    onChange={(e) => setFormPrintFormat(e.target.value as PrintFormat)}
                    className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  >
                    {PRINT_FORMATS.map((pf) => (
                      <option key={pf} value={pf}>
                        {pf}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <span className="text-xs font-semibold text-gray-900 block">
                      Block Takeaway Printing
                    </span>
                    <span className="text-[11px] text-gray-500">
                      Do not print KOT for takeaway orders placed within this room area
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formBlockTakeawayPrinting}
                    onChange={(e) => setFormBlockTakeawayPrinting(e.target.checked)}
                    className="w-4 h-4 text-[#7C3AED] rounded border-gray-300 focus:ring-[#7C3AED]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
