import type { User } from '../store/slices/auth-slice';

export function homePath(user?: Pick<User, 'name' | 'roles'> | null): '/orders' | '/dashboard' {
  return user?.roles.includes('URY Cashier')
    ? '/orders' : '/dashboard';
}
