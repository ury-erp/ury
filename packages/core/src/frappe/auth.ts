import { db, auth } from './client';

type LoggedUserResponse = string | null;

interface UserDoc {
  name: string;
  full_name: string;
  roles: Array<{
    name: string;
    role: string;
    parent: string;
  }>;
}

export const getLoggedUser = async (): Promise<LoggedUserResponse> => {
  try {
    const response = await auth.getLoggedInUser();
    return response as LoggedUserResponse;
  } catch (error) {
    console.error('Error getting logged user:', error);
    return null;
  }
};

export const getUserRoles = async (email: string): Promise<{ roles: string[]; full_name: string }> => {
  try {
    // Prefer frappe.boot session data: it reflects the user's *effective* roles
    // (including roles granted outside the User doctype's persisted "Has Role"
    // child table, e.g. Administrator). A fresh db.getDoc('User', email) call
    // reads that child table directly, which is not guaranteed to be populated
    // the same way the session boot's role list is.
    // @ts-ignore - frappe boot shape isn't typed here
    const boot = (window as any)?.frappe?.boot;
    const bootRoles: string[] = boot?.user?.roles || boot?.user_roles || [];
    const bootFullName: string = boot?.user?.full_name || boot?.user_info?.[email]?.fullname || '';

    let roles: string[] = bootRoles;
    let full_name: string = bootFullName;

    // Fall back to (and merge with) the persisted User doctype when boot data
    // is unavailable or incomplete, e.g. when looking up a user other than the
    // current session user, or when frappe.boot hasn't loaded yet.
    if (!roles.length || !full_name) {
      const userDoc = await db.getDoc<UserDoc>('User', email);

      if (!roles.length && userDoc?.roles) {
        roles = userDoc.roles.map(role => role.role);
      }
      if (!full_name && userDoc?.full_name) {
        full_name = userDoc.full_name;
      }
    }

    return { roles, full_name };
  } catch (error) {
    console.error('Error getting user details:', error);
    return { roles: [], full_name: '' };
  }
};

export const logout = async () => {
  try {
    return auth.logout();
  }catch(e){
    console.error('Error logging out:', e);
    return false;
  }
}
