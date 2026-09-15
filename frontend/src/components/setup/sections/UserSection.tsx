import React from 'react';
import { useConfigure, generateRandomPassword } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { call } from '@ury/core';

const FALLBACK_ROLE_OPTIONS = [
  { value: 'URY Cashier', label: 'URY Cashier' },
  { value: 'URY Captain', label: 'URY Captain' },
  { value: 'URY Manager', label: 'URY Manager' },
  { value: 'URY Admin', label: 'URY Admin' },
];

// Roles that only a System Manager caller (or the one-time bootstrap
// window) may hand out. Mirrors `_SELF_SERVICE_SETUP_ROLES` gate in
// ury/ury/api/minimal/business_setup.py -- kept here only as a UX
// fallback so the option can be hidden before the server round-trip
// resolves; the backend re-validates and is the actual source of truth.
const ELEVATED_ROLES = new Set(['URY Admin', 'System Manager']);

interface RoleOption {
  value: string;
  label: string;
}

/**
 * Resolves the role option list for the setup-wizard "Add User" role
 * field, and whether the current caller may assign elevated roles
 * (URY Admin). Pulls from the `Role` doctype (role_name like "URY %")
 * via the whitelisted `get_setup_role_options` API so a future new URY
 * role never requires a frontend code change; falls back to a static
 * list (still including URY Admin) if that call fails for any reason.
 */
function useRoleOptions() {
  const [options, setOptions] = React.useState<RoleOption[]>(FALLBACK_ROLE_OPTIONS);
  const [isSystemManager, setIsSystemManager] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res: any = await call.get(
          'ury.ury.api.minimal.business_setup.get_setup_role_options'
        );
        const payload = res?.message ?? res;
        if (cancelled || !payload) return;

        if (Array.isArray(payload.roles) && payload.roles.length) {
          setOptions(payload.roles.map((r: any) => ({ value: r.value, label: r.label })));
        }
        setIsSystemManager(!!payload.is_system_manager);
      } catch (error) {
        console.error('Error loading setup role options, using fallback list:', error);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, isSystemManager };
}

/**
 * Minimal multi-select checklist control. `SearchableSelect` (shared
 * component used elsewhere in setup/dashboard) is single-value only, so
 * roles use this small local dropdown instead of changing that shared
 * component's contract for unrelated consumers.
 */
function RoleMultiSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string[];
  options: RoleOption[];
  onChange: (roles: string[]) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRole = (role: string) => {
    if (value.includes(role)) {
      // Always keep at least one role selected.
      if (value.length === 1) return;
      onChange(value.filter((r) => r !== role));
    } else {
      onChange([...value, role]);
    }
  };

  const summary = value.length ? value.join(', ') : 'Select role(s)';

  return (
    <div className="relative" ref={containerRef}>
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full text-sm bg-card border border-input rounded-md px-3 py-2 flex items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-card border border-input rounded-md shadow-md py-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(opt.value)}
                onChange={() => toggleRole(opt.value)}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, usersLength, updateUser, deleteUser, roleOptions }: any) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div
      key={user.id}
      className="py-2 flex flex-col md:flex-row md:items-center gap-3"
    >
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label htmlFor={`user-name-${user.id}`} className="sr-only">
            User Name
          </label>
          <Input
            id={`user-name-${user.id}`}
            type="text"
            value={user.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { name: e.target.value })}
            placeholder="Full Name"
            className="w-full text-sm bg-card"
          />
        </div>

        <div>
          <label htmlFor={`user-email-${user.id}`} className="sr-only">
            Email Address
          </label>
          <Input
            id={`user-email-${user.id}`}
            type="email"
            value={user.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { email: e.target.value })}
            placeholder="user@example.com"
            className="w-full text-sm bg-card"
          />
        </div>

        <div className="relative">
          <label htmlFor={`user-password-${user.id}`} className="sr-only">
            Password
          </label>
          <Input
            id={`user-password-${user.id}`}
            type={showPassword ? 'text' : 'password'}
            value={user.passwordPlaceholder}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { passwordPlaceholder: e.target.value })}
            placeholder="Password"
            className="w-full text-sm bg-card pr-9"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div>
          <label htmlFor={`user-role-${user.id}`} className="sr-only">
            Roles
          </label>
          <RoleMultiSelect
            id={`user-role-${user.id}`}
            value={user.roles}
            options={roleOptions}
            onChange={(roles) => updateUser(user.id, { roles })}
          />
        </div>
      </div>

      {usersLength > 1 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => deleteUser(user.id)}
          className="text-destructive hover:text-destructive hover:bg-destructive-tint self-end md:self-center shrink-0 p-2 h-auto"
          title="Delete User"
          aria-label="Delete user"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export function UserSection() {
  const { users, addUser, updateUser, deleteUser } = useConfigure();
  const { options: fetchedOptions, isSystemManager } = useRoleOptions();

  // Gate the elevated (URY Admin / System Manager) options to only appear
  // when the current setup caller is a System Manager (or the one-time
  // bootstrap window) -- mirrors the backend gate in create_setup_user(),
  // so operators don't select an option only to have it rejected server-side.
  const roleOptions = React.useMemo(
    () => fetchedOptions.filter((opt) => isSystemManager || !ELEVATED_ROLES.has(opt.value)),
    [fetchedOptions, isSystemManager]
  );

  const handleAdd = () => {
    addUser({
      name: '',
      email: '',
      passwordPlaceholder: generateRandomPassword(),
      roles: ['URY Cashier'],
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Header Row */}
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-muted-foreground">
          <div className="flex-1">User Name</div>
          <div className="flex-1">Email Address</div>
          <div className="flex-1">Password</div>
          <div className="flex-1">Role(s)</div>
          {users.length > 1 && <div className="w-8"></div>}
        </div>

        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            usersLength={users.length}
            updateUser={updateUser}
            deleteUser={deleteUser}
            roleOptions={roleOptions}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full py-2.5 border-dashed border-primary text-primary hover:bg-primary/10 flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add User
      </Button>
    </div>
  );
}
