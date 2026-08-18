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
  if (typeof window !== 'undefined') {
    const bootUser = (window as any).frappe?.boot?.user?.name || (window as any).frappe?.session_user;
    if (bootUser && bootUser !== 'Guest') {
      return bootUser;
    }
  }

  try {
    const response = await auth.getLoggedInUser();
    if (response && response !== 'Guest') {
      return response as LoggedUserResponse;
    }
    return null;
  } catch (error) {
    console.warn('Error getting logged user from network:', error);
    return null;
  }
};

export const getUserRoles = async (email: string): Promise<{ roles: string[]; full_name: string }> => {
  if (typeof window !== 'undefined') {
    const bootUser = (window as any).frappe?.boot?.user;
    if (bootUser && (bootUser.name === email || bootUser.email === email)) {
      return {
        roles: Array.isArray(bootUser.roles) ? bootUser.roles : [],
        full_name: bootUser.fullname || bootUser.name || email,
      };
    }
  }

  try {
    // Get user details using db.getDoc
    const userDoc = await db.getDoc<UserDoc>('User', email);
    
    if (!userDoc || !userDoc.roles) {
      return { roles: [], full_name: '' };
    }

    // Extract role names and full_name from the user doc
    return {
      roles: userDoc.roles.map(role => role.role),
      full_name: userDoc.full_name
    };
  } catch (error) {
    console.warn('Error getting user details from network:', error);
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
