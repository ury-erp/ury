import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2 } from 'lucide-react';
import { SearchableSelect } from '../../common/SearchableSelect';

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Pass@${pwd}`;
}

export function UserSection() {
  const { users, addUser, updateUser, deleteUser } = useConfigure();

  const handleAdd = () => {
    addUser({
      name: '',
      email: '',
      passwordPlaceholder: generateRandomPassword(),
      role: 'URY Cashier',
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Header Row */}
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-[#4B5563]">
          <div className="flex-1">User Name</div>
          <div className="flex-1">Email Address</div>
          <div className="flex-1">Password</div>
          <div className="flex-1">Role</div>
          {users.length > 1 && <div className="w-8"></div>}
        </div>

        {users.map((user) => (
          <div
            key={user.id}
            className="py-2 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Input
                  type="text"
                  value={user.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { name: e.target.value })}
                  placeholder="Full Name"
                  className="w-full text-sm bg-white"
                />
              </div>

              <div>
                <Input
                  type="email"
                  value={user.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full text-sm bg-white"
                />
              </div>

              <div>
                <Input
                  type="text"
                  value={user.passwordPlaceholder}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { passwordPlaceholder: e.target.value })}
                  placeholder="Password"
                  className="w-full text-sm bg-white font-mono"
                />
              </div>

              <div>
                <SearchableSelect
                  id={`user-role-${user.id}`}
                  value={user.role}
                  options={[
                    { value: 'URY Cashier', label: 'URY Cashier' },
                    { value: 'URY Captain', label: 'URY Captain' },
                    { value: 'URY Manager', label: 'URY Manager' },
                  ]}
                  onChange={(_, val) => updateUser(user.id, { role: val })}
                />
              </div>
            </div>

            {users.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => deleteUser(user.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center shrink-0 p-2 h-auto"
                title="Delete User"
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
        Add User
      </Button>
    </div>
  );
}
