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
  Grid,
  List,
  Edit,
  Trash2,
  LayoutGrid,
  Users,
  Building,
  MapPin,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  ExternalLink,
  Sliders,
} from 'lucide-react';

export type TableShape = 'Rectangle' | 'Square' | 'Circle';
export type TableStatus = 'Available' | 'Occupied' | 'Reserved' | 'Cleaning';

export interface TableLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableData {
  id: string;
  table_name: string;
  seats: number;
  room: string;
  branch: string;
  status: TableStatus;
  shape: TableShape;
  layout: TableLayout;
}

const INITIAL_TABLES: TableData[] = [
  {
    id: 'tbl-1',
    table_name: 'T-01',
    seats: 4,
    room: 'Main Hall',
    branch: 'Main Branch',
    status: 'Available',
    shape: 'Rectangle',
    layout: { x: 50, y: 50, width: 120, height: 80 },
  },
  {
    id: 'tbl-2',
    table_name: 'T-02',
    seats: 2,
    room: 'Main Hall',
    branch: 'Main Branch',
    status: 'Occupied',
    shape: 'Square',
    layout: { x: 200, y: 50, width: 80, height: 80 },
  },
  {
    id: 'tbl-3',
    table_name: 'T-03',
    seats: 6,
    room: 'Terrace',
    branch: 'Main Branch',
    status: 'Reserved',
    shape: 'Circle',
    layout: { x: 350, y: 50, width: 100, height: 100 },
  },
  {
    id: 'tbl-4',
    table_name: 'VIP-1',
    seats: 8,
    room: 'VIP Lounge',
    branch: 'Downtown Branch',
    status: 'Available',
    shape: 'Rectangle',
    layout: { x: 50, y: 200, width: 160, height: 90 },
  },
  {
    id: 'tbl-5',
    table_name: 'T-04',
    seats: 4,
    room: 'Main Hall',
    branch: 'Main Branch',
    status: 'Cleaning',
    shape: 'Square',
    layout: { x: 250, y: 200, width: 80, height: 80 },
  },
  {
    id: 'tbl-6',
    table_name: 'R-01',
    seats: 4,
    room: 'Rooftop Garden',
    branch: 'Beachfront Outpost',
    status: 'Available',
    shape: 'Circle',
    layout: { x: 380, y: 200, width: 90, height: 90 },
  },
];

const ROOMS = ['All Rooms', 'Main Hall', 'Terrace', 'VIP Lounge', 'Rooftop Garden', 'Bar Counter'];
const BRANCHES = ['All Branches', 'Main Branch', 'Downtown Branch', 'Beachfront Outpost'];
const STATUS_OPTIONS: TableStatus[] = ['Available', 'Occupied', 'Reserved', 'Cleaning'];
const SHAPE_OPTIONS: TableShape[] = ['Rectangle', 'Square', 'Circle'];

export default function TablePage() {
  const [tables, setTables] = useState<TableData[]>(INITIAL_TABLES);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('All Rooms');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableData | null>(null);

  // Form State
  const [formTableName, setFormTableName] = useState('');
  const [formSeats, setFormSeats] = useState(4);
  const [formRoom, setFormRoom] = useState('Main Hall');
  const [formBranch, setFormBranch] = useState('Main Branch');
  const [formStatus, setFormStatus] = useState<TableStatus>('Available');
  const [formShape, setFormShape] = useState<TableShape>('Rectangle');
  const [isAdvancedLayoutOpen, setIsAdvancedLayoutOpen] = useState(false);
  const [formLayoutX, setFormLayoutX] = useState(0);
  const [formLayoutY, setFormLayoutY] = useState(0);
  const [formLayoutWidth, setFormLayoutWidth] = useState(120);
  const [formLayoutHeight, setFormLayoutHeight] = useState(80);

  // Card Action dropdown state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const openAddDrawer = () => {
    setEditingTable(null);
    setFormTableName('');
    setFormSeats(4);
    setFormRoom('Main Hall');
    setFormBranch('Main Branch');
    setFormStatus('Available');
    setFormShape('Rectangle');
    setIsAdvancedLayoutOpen(false);
    setFormLayoutX(50);
    setFormLayoutY(50);
    setFormLayoutWidth(120);
    setFormLayoutHeight(80);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (table: TableData) => {
    setEditingTable(table);
    setFormTableName(table.table_name);
    setFormSeats(table.seats);
    setFormRoom(table.room);
    setFormBranch(table.branch);
    setFormStatus(table.status);
    setFormShape(table.shape);
    setFormLayoutX(table.layout.x);
    setFormLayoutY(table.layout.y);
    setFormLayoutWidth(table.layout.width);
    setFormLayoutHeight(table.layout.height);
    setIsAdvancedLayoutOpen(false);
    setIsDrawerOpen(true);
  };

  const handleSaveTable = () => {
    if (!formTableName.trim()) return;

    if (editingTable) {
      setTables((prev) =>
        prev.map((t) =>
          t.id === editingTable.id
            ? {
                ...t,
                table_name: formTableName,
                seats: formSeats,
                room: formRoom,
                branch: formBranch,
                status: formStatus,
                shape: formShape,
                layout: {
                  x: formLayoutX,
                  y: formLayoutY,
                  width: formLayoutWidth,
                  height: formLayoutHeight,
                },
              }
            : t
        )
      );
    } else {
      const newTable: TableData = {
        id: `tbl-${Date.now()}`,
        table_name: formTableName,
        seats: formSeats,
        room: formRoom,
        branch: formBranch,
        status: formStatus,
        shape: formShape,
        layout: {
          x: formLayoutX,
          y: formLayoutY,
          width: formLayoutWidth,
          height: formLayoutHeight,
        },
      };
      setTables((prev) => [newTable, ...prev]);
    }
    setIsDrawerOpen(false);
  };

  const handleDeleteTable = (tableId: string) => {
    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setActiveActionId(null);
  };

  const handleChangeStatus = (tableId: string, newStatus: TableStatus) => {
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, status: newStatus } : t))
    );
    setActiveActionId(null);
  };

  const handleLaunchFloorEditor = () => {
    alert('Launching POS Floor Layout Editor...');
  };

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const matchesSearch =
        searchQuery === '' ||
        table.table_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        table.room.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRoom = selectedRoom === 'All Rooms' || table.room === selectedRoom;
      const matchesBranch = selectedBranch === 'All Branches' || table.branch === selectedBranch;
      const matchesStatus = selectedStatus === 'All Statuses' || table.status === selectedStatus;

      return matchesSearch && matchesRoom && matchesBranch && matchesStatus;
    });
  }, [tables, searchQuery, selectedRoom, selectedBranch, selectedStatus]);

  // Helper badge style
  const getStatusBadgeVariant = (status: TableStatus) => {
    switch (status) {
      case 'Available':
        return 'success';
      case 'Occupied':
        return 'danger';
      case 'Reserved':
        return 'secondary';
      case 'Cleaning':
        return 'warning';
      default:
        return 'outline';
    }
  };

  // Helper visual card shape render
  const renderShapeIndicator = (shape: TableShape, name: string, seats: number, status: TableStatus) => {
    let colorClasses = '';
    switch (status) {
      case 'Available':
        colorClasses = 'border-green-500 bg-green-50/80 text-green-900';
        break;
      case 'Occupied':
        colorClasses = 'border-red-500 bg-red-50/80 text-red-900';
        break;
      case 'Reserved':
        colorClasses = 'border-purple-500 bg-purple-50/80 text-purple-900';
        break;
      case 'Cleaning':
        colorClasses = 'border-yellow-500 bg-yellow-50/80 text-yellow-900';
        break;
    }

    if (shape === 'Circle') {
      return (
        <div className="flex flex-col items-center justify-center my-2">
          <div
            className={`w-20 h-20 rounded-full border-2 border-dashed flex flex-col items-center justify-center font-bold shadow-xs transition-transform hover:scale-105 ${colorClasses}`}
          >
            <span className="text-base font-extrabold">{name}</span>
            <span className="text-[10px] font-medium flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />
              {seats} Seats
            </span>
          </div>
        </div>
      );
    }

    if (shape === 'Square') {
      return (
        <div className="flex flex-col items-center justify-center my-2">
          <div
            className={`w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center font-bold shadow-xs transition-transform hover:scale-105 ${colorClasses}`}
          >
            <span className="text-base font-extrabold">{name}</span>
            <span className="text-[10px] font-medium flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />
              {seats} Seats
            </span>
          </div>
        </div>
      );
    }

    // Default Rectangle
    return (
      <div className="flex flex-col items-center justify-center my-2">
        <div
          className={`w-28 h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center font-bold shadow-xs transition-transform hover:scale-105 ${colorClasses}`}
        >
          <span className="text-base font-extrabold">{name}</span>
          <span className="text-[10px] font-medium flex items-center gap-0.5">
            <Users className="w-2.5 h-2.5" />
            {seats} Seats
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <LayoutGrid className="w-7 h-7 text-primary" />
            Table Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure floor tables, seat capacity, room assignments, and floor layout coordinates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleLaunchFloorEditor}
            className="gap-2 border-gray-200 text-gray-700 hover:bg-purple-50 hover:text-primary"
          >
            <Sliders className="w-4 h-4 text-primary" />
            Edit Floor Layout
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>

          <Button
            onClick={openAddDrawer}
            className="gap-2 bg-primary hover:bg-primary-700 text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Table
          </Button>
        </div>
      </div>

      {/* Toolbar: Search, Filters & View Toggle */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search table name or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-50/50 border-gray-200 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Room filter */}
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ROOMS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Branch filter */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="All Statuses">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-primary shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="POS Floor Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-primary shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Table List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* POS Floor Cards Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredTables.map((table) => (
            <Card
              key={table.id}
              className="rounded-xl border border-gray-200 bg-white hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
            >
              <CardHeader className="p-4 border-b border-gray-100 bg-gray-50/30 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-gray-900">
                      {table.table_name}
                    </CardTitle>
                    <Badge variant={getStatusBadgeVariant(table.status)}>
                      {table.status}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-gray-500 mt-0.5">
                    {table.room} • {table.branch}
                  </CardDescription>
                </div>

                {/* Card action dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveActionId(activeActionId === table.id ? null : table.id)
                    }
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {activeActionId === table.id && (
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveActionId(null);
                          openEditDrawer(table);
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-purple-50 hover:text-primary flex items-center gap-2"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit Table
                      </button>

                      <div className="px-4 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Set Status
                      </div>
                      {STATUS_OPTIONS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleChangeStatus(table.id, st)}
                          className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 ${
                            table.status === st
                              ? 'bg-purple-50 text-primary font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {st}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleDeleteTable(table.id)}
                        className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100 mt-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Table
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>

              {/* Visual Floor Layout Shape Representation */}
              <CardContent className="p-6 flex flex-col items-center justify-center bg-gray-50/20">
                {renderShapeIndicator(table.shape, table.table_name, table.seats, table.status)}

                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium text-gray-700">
                    Shape: {table.shape}
                  </span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium text-gray-700">
                    Pos: ({table.layout.x}, {table.layout.y})
                  </span>
                </div>
              </CardContent>

              <CardFooter className="p-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDrawer(table)}
                  className="w-full text-xs text-gray-600 hover:text-primary hover:bg-purple-50"
                >
                  <Edit className="w-3.5 h-3.5 mr-1" />
                  Configure Table
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="p-4">Table Name</th>
                  <th className="p-4">Shape</th>
                  <th className="p-4">Seats</th>
                  <th className="p-4">Room Area</th>
                  <th className="p-4">Branch</th>
                  <th className="p-4">Layout Position</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredTables.map((table) => (
                  <tr key={table.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-4 font-bold text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        {table.table_name}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">{table.shape}</td>
                    <td className="p-4 text-gray-600">{table.seats} Seats</td>
                    <td className="p-4 text-gray-600">{table.room}</td>
                    <td className="p-4 text-gray-600">{table.branch}</td>
                    <td className="p-4 text-gray-500 text-xs">
                      X: {table.layout.x}, Y: {table.layout.y} ({table.layout.width}x{table.layout.height})
                    </td>
                    <td className="p-4">
                      <Badge variant={getStatusBadgeVariant(table.status)}>
                        {table.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDrawer(table)}
                          className="h-8 px-2 text-gray-600 hover:text-primary hover:bg-purple-50"
                          title="Edit Table"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTable(table.id)}
                          className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="Delete Table"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Table details */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingTable ? 'Edit Table Details' : 'Add New Table'}
        subtitle="Configure table properties, seat capacity, room assignment, and floor position."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveTable}
              className="bg-primary hover:bg-primary-700 text-white"
            >
              Save Table Details
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Main Table Form */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
              General Properties
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Table Name *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. T-01"
                  value={formTableName}
                  onChange={(e) => setFormTableName(e.target.value)}
                  className="w-full bg-white border-gray-200 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Number of Seats *
                </label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={formSeats}
                  onChange={(e) => setFormSeats(parseInt(e.target.value) || 1)}
                  className="w-full bg-white border-gray-200 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Room Area *</label>
                <select
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {ROOMS.filter((r) => r !== 'All Rooms').map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Branch *</label>
                <select
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {BRANCHES.filter((b) => b !== 'All Branches').map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Table Shape *</label>
                <select
                  value={formShape}
                  onChange={(e) => setFormShape(e.target.value as TableShape)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SHAPE_OPTIONS.map((shape) => (
                    <option key={shape} value={shape}>
                      {shape}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Initial Status *</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as TableStatus)}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Collapsible Advanced Layout Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsAdvancedLayoutOpen(!isAdvancedLayoutOpen)}
              className="w-full p-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100/60 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Advanced Floor Layout Coordinates</h4>
                  <p className="text-[11px] text-gray-500">Fine-tune X, Y position and table dimensions in POS map</p>
                </div>
              </div>
              {isAdvancedLayoutOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {isAdvancedLayoutOpen && (
              <div className="p-5 border-t border-gray-100 bg-white grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">X Position (px)</label>
                  <Input
                    type="number"
                    value={formLayoutX}
                    onChange={(e) => setFormLayoutX(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Y Position (px)</label>
                  <Input
                    type="number"
                    value={formLayoutY}
                    onChange={(e) => setFormLayoutY(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Width (px)</label>
                  <Input
                    type="number"
                    value={formLayoutWidth}
                    onChange={(e) => setFormLayoutWidth(parseInt(e.target.value) || 80)}
                    className="w-full bg-white border-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Height (px)</label>
                  <Input
                    type="number"
                    value={formLayoutHeight}
                    onChange={(e) => setFormLayoutHeight(parseInt(e.target.value) || 80)}
                    className="w-full bg-white border-gray-200"
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
