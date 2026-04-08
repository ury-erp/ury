import { call } from './frappe-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeResponse {
  user: string;
  full_name: string;
  ury_role: string | null;
  capabilities: string[];
}

export interface URYUser {
  user: string;
  email: string;
  full_name: string;
  ury_role: string;
  enabled: number;
  invited_by: string;
  invited_on: string;
}

export interface URYRoleCapability {
  capability: string;
  label: string;
}

export interface URYRole {
  role_name: string;
  description: string;
  is_system_role: number;
  desk_access: number;
  frappe_role: string;
  capabilities: URYRoleCapability[];
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function handleFrappeError(error: unknown): never {
  const err = error as { message?: string; exc_type?: string; _server_messages?: string };
  let message = 'An unexpected error occurred.';

  if (err._server_messages) {
    try {
      const msgs = JSON.parse(err._server_messages);
      if (Array.isArray(msgs) && msgs.length > 0) {
        const parsed = JSON.parse(msgs[0]);
        message = parsed.message || message;
      }
    } catch {
      // fallback
    }
  } else if (err.message) {
    message = err.message;
  }

  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Auth / Me
// ---------------------------------------------------------------------------

export async function getMe(): Promise<MeResponse> {
  try {
    const res = await call.get('ury.ury.permissions.get_me');
    return res as unknown as MeResponse;
  } catch (error) {
    handleFrappeError(error);
  }
}

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

export async function getUsers(): Promise<URYUser[]> {
  try {
    const res = await call.get('ury.ury.api.permissions_api.get_users');
    return res as unknown as URYUser[];
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function inviteUser(
  email: string,
  full_name: string,
  ury_role: string
): Promise<{ message: string }> {
  try {
    const res = await call.post('ury.ury.api.permissions_api.invite_user', {
      email,
      full_name,
      ury_role,
    });
    return res as unknown as { message: string };
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function updateUserRole(
  user: string,
  ury_role: string
): Promise<{ message: string }> {
  try {
    const res = await call.post('ury.ury.api.permissions_api.update_user_role', {
      user,
      ury_role,
    });
    return res as unknown as { message: string };
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function setUserEnabled(
  user: string,
  enabled: number
): Promise<{ message: string }> {
  try {
    const res = await call.post('ury.ury.api.permissions_api.set_user_enabled', {
      user,
      enabled,
    });
    return res as unknown as { message: string };
  } catch (error) {
    handleFrappeError(error);
  }
}

// ---------------------------------------------------------------------------
// Role Management
// ---------------------------------------------------------------------------

export async function getURYRoles(): Promise<URYRole[]> {
  try {
    const res = await call.get('ury.ury.api.permissions_api.get_ury_roles');
    return res as unknown as URYRole[];
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function getCapabilitiesCatalogue(): Promise<Record<string, string>> {
  try {
    const res = await call.get('ury.ury.api.permissions_api.get_capabilities_catalogue');
    return res as unknown as Record<string, string>;
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function createURYRole(
  role_name: string,
  description: string,
  capabilities: string[],
  desk_access: number = 0
): Promise<{ message: string }> {
  try {
    const res = await call.post('ury.ury.api.permissions_api.create_ury_role', {
      role_name,
      description,
      capabilities: JSON.stringify(capabilities),
      desk_access,
    });
    return res as unknown as { message: string };
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function updateURYRole(
  role_name: string,
  capabilities: string[],
  description?: string
): Promise<{ message: string }> {
  try {
    const res = await call.post('ury.ury.api.permissions_api.update_ury_role', {
      role_name,
      capabilities: JSON.stringify(capabilities),
      description,
    });
    return res as unknown as { message: string };
  } catch (error) {
    handleFrappeError(error);
  }
}

export async function deleteURYRole(
  role_name: string
): Promise<{ message: string }> {
  try {
    const res = await call.post('ury.ury.api.permissions_api.delete_ury_role', {
      role_name,
    });
    return res as unknown as { message: string };
  } catch (error) {
    handleFrappeError(error);
  }
}
