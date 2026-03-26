import { auth, call } from './client';
import { FrappeResponse, UserSession } from './types';

/**
 * Authentication API
 * 
 * Functions for user authentication and session management
 */

// Login with username/password
export async function login(username: string, password: string): Promise<void> {
  await auth.loginWithUsernamePassword({ username, password });
}

// Logout
export async function logout(): Promise<void> {
  await auth.logout();
}

// Get current user
export async function getCurrentUser(): Promise<string | null> {
  return await auth.getLoggedInUser();
}

// Check if user is logged in
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null && user !== 'Guest';
}

// Get user info
export async function getUserInfo(): Promise<UserSession | null> {
  try {
    const response = await call.get<FrappeResponse<UserSession>>(
      'frappe.auth.get_logged_user'
    );
    return response.message;
  } catch {
    return null;
  }
}

// Cookie-based auth (for guest/token access)
export async function loginWithToken(token: string): Promise<void> {
  // Set cookie or header for token-based auth
  document.cookie = `customer_token=${token}; path=/;`;
}
