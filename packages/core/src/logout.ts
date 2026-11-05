export async function logoutSession(csrfToken: string | undefined): Promise<void> {
  const response = await fetch('/api/method/logout', {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': csrfToken || '' },
  });
  if (!response.ok) {
    throw new Error('Failed to logout. Please try again.');
  }
}
