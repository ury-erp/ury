import React, { useState } from 'react';
import {
  Search,
  Plus,
  Mail,
  MapPin,
  Building2,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Users
} from 'lucide-react';
import { Button, Input, Select, SelectItem, Card } from '@ury/ui';
import Drawer from '../../components/common/Drawer';

export interface UserItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  roles: string[];
  assigned_room: string;
  branch: string;
  enabled: boolean;
  avatar?: string;
}

const INITIAL_USERS: UserItem[] = [
  {
    id: 'usr-1',
    first_name: 'Alex',
    last_name: 'Rivera',
    email: 'alex.rivera@ury.com',
    roles: ['URY Manager', 'URY Cashier'],
    assigned_room: 'Main Dining Hall',
    branch: 'Main Branch',
    enabled: true,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-2',
    first_name: 'Sarah',
    last_name: 'Chen',
    email: 'sarah.chen@ury.com',
    roles: ['URY Cashier'],
    assigned_room: 'Front Bar Area',
    branch: 'Main Branch',
    enabled: true,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-3',
    first_name: 'Marcus',
    last_name: 'Vance',
    email: 'marcus.vance@ury.com',
    roles: ['URY Waiter'],
    assigned_room: 'Patio & Terrace',
    branch: 'Downtown Outlet',
    enabled: true,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-4',
    first_name: 'Elena',
    last_name: 'Rostova',
    email: 'elena.rostova@ury.com',
    roles: ['URY Waiter'],
    assigned_room: 'VIP Lounge',
    branch: 'Main Branch',
    enabled: false,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
  },
];

export const UserPage: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>(INITIAL_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  
  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['URY Waiter']);
  const [assignedRoom, setAssignedRoom] = useState('Main Dining Hall');
  const [branch, setBranch] = useState('Main Branch');
  const [enabled, setEnabled] = useState(true);

  const availableRoles = ['URY Cashier', 'URY Waiter', 'URY Manager'];

  const openCreateDrawer = () => {
    setEditingUserId(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setSelectedRoles(['URY Waiter']);
    setAssignedRoom('Main Dining Hall');
    setBranch('Main Branch');
    setEnabled(true);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (user: UserItem) => {
    setEditingUserId(user.id);
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setEmail(user.email);
    setPassword('');
    setSelectedRoles(user.roles);
    setAssignedRoom(user.assigned_room);
    setBranch(user.branch);
    setEnabled(user.enabled);
    setIsDrawerOpen(true);
  };

  const handleToggleStatus = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, enabled: !u.enabled } : u));
  };

  const handleDeleteUser = (id: string) => {
    setUsers(users.filter(u => u.id !== id));
  };

  const handleRoleCheckbox = (role: string) => {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length > 1) {
        setSelectedRoles(selectedRoles.filter(r => r !== role));
      }
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) return;

    if (editingUserId) {
      setUsers(users.map(u => u.id === editingUserId ? {
        ...u,
        first_name: firstName,
        last_name: lastName,
        email,
        roles: selectedRoles,
        assigned_room: assignedRoom,
        branch,
        enabled,
      } : u));
    } else {
      const newUser: UserItem = {
        id: `usr-${Date.now()}`,
        first_name: firstName,
        last_name: lastName,
        email,
        roles: selectedRoles,
        assigned_room: assignedRoom,
        branch,
        enabled,
      };
      setUsers([newUser, ...users]);
    }
    setIsDrawerOpen(false);
  };

  const filteredUsers = users.filter((u) => {
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.roles.includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Header & Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Staff & User Management</h1>
              <p className="text-sm text-gray-500">Configure restaurant user accounts, floor roles, and room assignments.</p>
            </div>
          </div>
          <Button
            onClick={openCreateDrawer}
            className="bg-primary hover:bg-primary-700 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add User
          </Button>
        </div>

        {/* Toolbar Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search staff by name or email..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50/50"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Filter Role:</span>
            <div className="w-44">
              <Select value={roleFilter} onValueChange={(val: string) => setRoleFilter(val)}>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="URY Manager">URY Manager</SelectItem>
                <SelectItem value="URY Cashier">URY Cashier</SelectItem>
                <SelectItem value="URY Waiter">URY Waiter</SelectItem>
              </Select>
            </div>
          </div>
        </div>

        {/* Staff Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={`${user.first_name} ${user.last_name}`}
                        className="w-12 h-12 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                        {user.first_name[0]}
                        {user.last_name ? user.last_name[0] : ''}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">
                        {user.first_name} {user.last_name}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{user.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditDrawer(user)}
                      className="p-1.5 text-gray-400 hover:text-primary hover:bg-purple-50 rounded-lg transition-colors"
                      title="Edit User"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete User"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.map((r) => (
                      <span
                        key={r}
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          r === 'URY Manager'
                            ? 'bg-purple-50 border-purple-200 text-purple-700'
                            : r === 'URY Cashier'
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600 pt-1">
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span>{user.branch}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <span>{user.assigned_room}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {user.enabled ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                      <XCircle className="w-3 h-3" /> Disabled
                    </span>
                  )}
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={user.enabled}
                    onChange={() => handleToggleStatus(user.id)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingUserId ? 'Edit Staff User' : 'Add New User'}
        subtitle="Configure user login credentials, role assignments, and floor access permissions."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} className="bg-primary hover:bg-primary-700 text-white">
              {editingUserId ? 'Update User' : 'Create User'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveUser} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <Input
                value={firstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
                placeholder="e.g. John"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <Input
                value={lastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
                placeholder="e.g. Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
            <Input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="john.doe@ury.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder={editingUserId ? 'Leave empty to keep existing' : 'Minimum 8 characters'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role Selection *</label>
            <div className="space-y-2 border border-gray-200 rounded-xl p-3 bg-gray-50/50">
              {availableRoles.map((role) => (
                <label key={role} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={() => handleRoleCheckbox(role)}
                    className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">{role}</span>
                    <span className="text-xs text-gray-500">
                      {role === 'URY Manager' && 'Full administrative access and reporting.'}
                      {role === 'URY Cashier' && 'Terminal billing, daily close, and cash drawer.'}
                      {role === 'URY Waiter' && 'Table taking, order placement, and status updates.'}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Room</label>
            <Select value={assignedRoom} onValueChange={(val: string) => setAssignedRoom(val)}>
              <SelectItem value="Main Dining Hall">Main Dining Hall</SelectItem>
              <SelectItem value="Front Bar Area">Front Bar Area</SelectItem>
              <SelectItem value="Patio & Terrace">Patio & Terrace</SelectItem>
              <SelectItem value="VIP Lounge">VIP Lounge</SelectItem>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
            <Select value={branch} onValueChange={(val: string) => setBranch(val)}>
              <SelectItem value="Main Branch">Main Branch</SelectItem>
              <SelectItem value="Downtown Outlet">Downtown Outlet</SelectItem>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <span className="text-sm font-semibold text-gray-900 block">Account Status</span>
              <span className="text-xs text-gray-500">Enabled accounts can log into POS terminals.</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </form>
      </Drawer>
    </div>
  );
};

export default UserPage;
