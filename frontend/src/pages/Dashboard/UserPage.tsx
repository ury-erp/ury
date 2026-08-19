import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Users, Plus, ShieldCheck, Edit2 } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { Switch } from '../../components/ui/switch';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface UserRecord {
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  user_type?: string;
  enabled?: number;
  roles?: Array<{ role: string }>;
}

export const UserPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [newUser, setNewUser] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: 'URY Cashier',
    enabled: true,
  });

  const URY_ROLES = ['URY Manager', 'URY Waiter', 'URY Cashier'];

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<UserRecord>('User', activeBranchId);
      setUsers(records);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [activeBranchId]);

  const getDisplayRole = (user: UserRecord): string => {
    // Try to extract URY role from user's roles
    if (user.roles && Array.isArray(user.roles)) {
      for (const roleObj of user.roles) {
        if (roleObj.role === 'URY Manager') return 'Manager';
        if (roleObj.role === 'URY Waiter') return 'Waiter';
        if (roleObj.role === 'URY Cashier') return 'Cashier';
      }
    }
    return 'User';
  };

  const openAddDrawer = () => {
    setEditingUser(null);
    setNewUser({ first_name: '', last_name: '', email: '', role: 'URY Cashier', enabled: true });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = async (user: UserRecord) => {
    setEditingUser(user);
    let userRole = 'URY Cashier'; // default

    try {
      // Fetch the full user record with roles
      const fullUserRes = await call('frappe.client.get', {
        doctype: 'User',
        name: user.name,
      });
      const fullUser = (fullUserRes as any).message || fullUserRes;

      // Extract the actual URY role from the roles array
      if (fullUser.roles && Array.isArray(fullUser.roles)) {
        for (const roleObj of fullUser.roles) {
          if (URY_ROLES.includes(roleObj.role)) {
            userRole = roleObj.role;
            break;
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch user roles', err);
      // Default to URY Cashier on error
    }

    setNewUser({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      role: userRole,
      enabled: user.enabled === 1,
    });
    setIsDrawerOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email) return;
    setSaving(true);
    try {
      if (editingUser) {
        await call('frappe.client.set_value', {
          doctype: 'User',
          name: editingUser.name,
          fieldname: {
            first_name: newUser.first_name,
            last_name: newUser.last_name,
            enabled: newUser.enabled ? 1 : 0,
          },
        });

        if (newUser.role) {
          // Fetch current roles
          const fullUserRes = await call('frappe.client.get', {
            doctype: 'User',
            name: editingUser.name,
          });
          const fullUser = (fullUserRes as any).message || fullUserRes;

          // Start with current roles
          let updatedRoles = fullUser.roles && Array.isArray(fullUser.roles) ? [...fullUser.roles] : [];

          // Filter out existing URY roles
          updatedRoles = updatedRoles.filter((roleObj: any) => !URY_ROLES.includes(roleObj.role));

          // Add the new URY role
          updatedRoles.push({ role: newUser.role });

          // Save the merged roles
          await call('frappe.client.set_value', {
            doctype: 'User',
            name: editingUser.name,
            fieldname: 'roles',
            value: updatedRoles,
          });
        }
      } else {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'User',
            email: newUser.email,
            first_name: newUser.first_name,
            last_name: newUser.last_name,
            send_welcome_email: 1,
            enabled: newUser.enabled ? 1 : 0,
            roles: [{ role: newUser.role }],
          },
        });
      }
      fetchUsers();
      setIsDrawerOpen(false);
      showToast.success(`User ${editingUser ? 'updated' : 'added'} successfully`);
    } catch (err: any) {
      console.error('Failed to save User', err);
      let errorMessage = 'Failed to save User';
      if (err._server_messages) {
        try {
          const messages = JSON.parse(err._server_messages);
          if (messages.length > 0) {
            const lastMessage = JSON.parse(messages[messages.length - 1]);
            if (lastMessage.message) {
              errorMessage = lastMessage.message.replace(/<[^>]*>?/gm, '');
            }
          }
        } catch (e) {}
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.exc) {
        errorMessage = 'Duplicate entry or server error occurred.';
      }
      showToast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar — no title, partition style */}
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add User</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : users.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Users Configured</h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            Add staff users and assign them roles for this branch.
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </Button>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">User ID</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.name} className="hover:bg-primary/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs uppercase shrink-0">
                        {(user.first_name || user.email || user.name || '?').charAt(0)}
                      </div>
                      <div className="font-semibold text-gray-900">
                        {user.first_name || user.full_name || user.name}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 font-medium">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      {getDisplayRole(user)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEditDrawer(user)} className="text-gray-500 hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit SideDrawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
      >
        <form onSubmit={handleSaveUser} className="space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">First Name</label>
              <Input
                value={newUser.first_name}
                onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">Last Name</label>
              <Input
                value={newUser.last_name}
                onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">User ID</label>
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              required
              disabled={!!editingUser}
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Role / Access Level</label>
            <SearchableSelect
              id="role"
              value={newUser.role}
              onChange={(_, value) => setNewUser({ ...newUser, role: value })}
              options={[
                { value: 'URY Cashier', label: 'URY Cashier' },
                { value: 'URY Waiter', label: 'URY Waiter' },
                { value: 'URY Manager', label: 'URY Manager' },
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="user-enabled"
              checked={newUser.enabled}
              onCheckedChange={(checked) => setNewUser({ ...newUser, enabled: checked })}
            />
            <label htmlFor="user-enabled" className="font-semibold text-gray-700 cursor-pointer">
              Enabled (Active User)
            </label>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-4 border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white px-6 flex items-center gap-2" disabled={saving}>
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default UserPage;
