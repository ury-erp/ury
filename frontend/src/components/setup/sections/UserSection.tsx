import React from 'react';
import { useConfigure, generateRandomPassword } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { SearchableSelect } from '../../common/SearchableSelect';
import { t } from '../../../i18n';

function UserRow({ user, usersLength, updateUser, deleteUser }: any) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div
      key={user.id}
      className="py-2 flex flex-col md:flex-row md:items-center gap-3"
    >
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label htmlFor={`user-name-${user.id}`} className="sr-only">{t('dash.user_section.user_name')}</label>
          <Input
            id={`user-name-${user.id}`}
            type="text"
            value={user.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { name: e.target.value })}
            placeholder={t('dash.user_section.full_name')}
            className="w-full text-sm bg-white"
          />
        </div>

        <div>
          <label htmlFor={`user-email-${user.id}`} className="sr-only">{t('dash.user_section.email_address')}</label>
          <Input
            id={`user-email-${user.id}`}
            type="email"
            value={user.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { email: e.target.value })}
            placeholder="user@example.com"
            className="w-full text-sm bg-white"
          />
        </div>

        <div className="relative">
          <label htmlFor={`user-password-${user.id}`} className="sr-only">{t('dash.user_section.password')}</label>
          <Input
            id={`user-password-${user.id}`}
            type={showPassword ? 'text' : 'password'}
            value={user.passwordPlaceholder}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateUser(user.id, { passwordPlaceholder: e.target.value })}
            placeholder={t('dash.user_section.password')}
            className="w-full text-sm bg-white pe-9"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div>
          <label htmlFor={`user-role-${user.id}`} className="sr-only">{t('dash.user_section.role')}</label>
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

      {usersLength > 1 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => deleteUser(user.id)}
          className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center shrink-0 p-2 h-auto"
          title={t('dash.user_section.delete_user')}
          aria-label={t('dash.user_section.delete_user')}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
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
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-muted-foreground">
          <div className="flex-1">{t('dash.user_section.user_name')}</div>
          <div className="flex-1">{t('dash.user_section.email_address')}</div>
          <div className="flex-1">{t('dash.user_section.password')}</div>
          <div className="flex-1">{t('dash.user_section.role')}</div>
          {users.length > 1 && <div className="w-8"></div>}
        </div>

        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            usersLength={users.length}
            updateUser={updateUser}
            deleteUser={deleteUser}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full py-2.5 border-dashed border-primary text-primary hover:bg-primary/10 flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />{t('dash.user_section.add_user')}</Button>
    </div>
  );
}
