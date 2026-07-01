import { call, db, auth } from './frappe-sdk';
import { getErrorMessage } from './error-utils';

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
    throw new Error(`Failed to get logged user: ${getErrorMessage(error)}`);
  }
};

export const getUserRoles = async (email: string): Promise<{ roles: string[]; full_name: string }> => {
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
    throw new Error(`Failed to get user roles: ${getErrorMessage(error)}`);
  }
};

export const logout = async () => {
  try {
    return auth.logout();
  }catch(e){
    throw new Error(`Failed to logout: ${getErrorMessage(e)}`);
  }
}