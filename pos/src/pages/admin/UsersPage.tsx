import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  ChevronDown,
  Shield,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
} from 'lucide-react';
import { Button, Input, Badge, Card } from '../../components/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Select, SelectItem } from '../../components/ui/select';
import { showToast } from '../../components/ui/toast';
import { usePermissions } from '../../contexts/PermissionsContext';
import {
  getUsers,
  inviteUser,
  updateUserRole,
  setUserEnabled,
  getURYRoles,
  type URYUser,
  type URYRole,
} from '../../lib/permissions-api';
import { Link } from 'react-router-dom';

// Role color mapping
const ROLE_COLORS: Record<string, 'danger' | 'info' | 'success' | 'warning' | 'secondary' | 'default'> = {
  'URY Admin': 'danger',
  'URY Ops Admin': 'danger',
  'URY Manager': 'info',
  'URY Director': 'warning',
  'URY Purchase Manager': 'info',
  'URY Sales Manager': 'info',
  'URY Accountant': 'success',
  'URY Analyst': 'secondary',
  'URY Captain': 'success',
  'URY Servicer': 'warning',
  'URY Cashier': 'success',
  'URY Chef': 'warning',
  'URY Store Manager': 'info',
  'URY Store Admin': 'danger',
  'URY Store Accountant': 'success',
};

function getRoleBadgeVariant(role: string) {
  return ROLE_COLORS[role] || 'secondary';
}

const UsersPage = () => {
  const { hasCapability } = usePermissions();
  const [users, setUsers] = useState<URYUser[]>([]);
  const [roles, setRoles] = useState<URYRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', ury_role: '' });
  const [isInviting, setIsInviting] = useState(false);
  const [editingRole, setEditingRole] = useState<{ user: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState('');

  const canManageUsers = hasCapability('users.manage');
  const canCreateUsers = hasCapability('users.create');

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [usersData, rolesData] = await Promise.all([getUsers(), getURYRoles()]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err) {
      showToast.error((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !searchQuery ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter =
        filterStatus === 'all' ||
        (filterStatus === 'active' && u.enabled) ||
        (filterStatus === 'disabled' && !u.enabled);
      return matchesSearch && matchesFilter;
    });
  }, [users, searchQuery, filterStatus]);

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.full_name || !inviteForm.ury_role) {
      showToast.error('All fields are required.');
      return;
    }
    try {
      setIsInviting(true);
      await inviteUser(inviteForm.email, inviteForm.full_name, inviteForm.ury_role);
      showToast.success('User invited successfully.');
      setShowInviteDialog(false);
      setInviteForm({ email: '', full_name: '', ury_role: '' });
      fetchData();
    } catch (err) {
      showToast.error((err as Error).message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (user: string) => {
    if (!newRole) return;
    try {
      await updateUserRole(user, newRole);
      showToast.success('Role updated.');
      setEditingRole(null);
      setNewRole('');
      fetchData();
    } catch (err) {
      showToast.error((err as Error).message);
    }
  };

  const handleToggleEnabled = async (user: string, currentEnabled: number) => {
    try {
      await setUserEnabled(user, currentEnabled ? 0 : 1);
      showToast.success(currentEnabled ? 'User disabled.' : 'User enabled.');
      fetchData();
    } catch (err) {
      showToast.error((err as Error).message);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-6 h-6" />
                User Management
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {users.length} user{users.length !== 1 ? 's' : ''} total
              </p>
            </div>
          </div>
          {canCreateUsers && (
            <Button onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'active', 'disabled'] as const).map((status) => (
              <Button
                key={status}
                variant={filterStatus === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    User
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Role
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Invited By
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    Invited On
                  </th>
                  {canManageUsers && (
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canManageUsers ? 6 : 5} className="text-center py-12 text-gray-500">
                      {searchQuery ? 'No users match your search.' : 'No users found.'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.user} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{u.full_name || '—'}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {editingRole?.user === u.user ? (
                          <div className="flex items-center gap-2">
                            <Select
                              value={newRole}
                              onValueChange={setNewRole}
                              placeholder="Select role"
                            >
                              {roles.map((r) => (
                                <SelectItem key={r.role_name} value={r.role_name}>
                                  {r.role_name}
                                </SelectItem>
                              ))}
                            </Select>
                            <Button size="xs" onClick={() => handleRoleChange(u.user)}>
                              Save
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setEditingRole(null);
                                setNewRole('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant={getRoleBadgeVariant(u.ury_role)} size="sm">
                              <Shield className="w-3 h-3 mr-1" />
                              {u.ury_role}
                            </Badge>
                            {canManageUsers && (
                              <button
                                onClick={() => {
                                  setEditingRole({ user: u.user, currentRole: u.ury_role });
                                  setNewRole(u.ury_role);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={u.enabled ? 'success' : 'cancelled'} size="sm">
                          {u.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{u.invited_by || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(u.invited_on)}</td>
                      {canManageUsers && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleToggleEnabled(u.user, u.enabled)}
                            className="text-gray-400 hover:text-gray-700 transition-colors"
                            title={u.enabled ? 'Disable user' : 'Enable user'}
                          >
                            {u.enabled ? (
                              <ToggleRight className="w-6 h-6 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400" />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent variant="default" onClose={() => setShowInviteDialog(false)}>
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
          </DialogHeader>
          <div className="px-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <Input
                placeholder="John Doe"
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <Select
                value={inviteForm.ury_role}
                onValueChange={(val) => setInviteForm({ ...inviteForm, ury_role: val })}
                placeholder="Select a role"
              >
                {roles.map((r) => (
                  <SelectItem key={r.role_name} value={r.role_name}>
                    {r.role_name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isInviting}>
              {isInviting ? 'Inviting...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
