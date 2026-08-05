import { auth } from "./client";

type LoggedUserResponse = string | null;

export const getLoggedUser = async (): Promise<LoggedUserResponse> => {
  try {
    const response = await auth.getLoggedInUser();
    return response as LoggedUserResponse;
  } catch (error) {
    console.error("Error getting logged user:", error);
    return null;
  }
};

export const getUserRoles = async (): Promise<{ roles: string[]; full_name: string }> => {
  try {
    const boot = (window as any).frappe?.boot;
    if (boot?.user) {
      return {
        roles: boot.user.roles || [],
        full_name: boot.user.full_name || "",
      };
    }
    return { roles: [], full_name: "" };
  } catch (error) {
    console.error("Error getting user details:", error);
    return { roles: [], full_name: "" };
  }
};

export const logout = async () => {
  try {
    return auth.logout();
  } catch (e) {
    console.error("Error logging out:", e);
    return false;
  }
};
