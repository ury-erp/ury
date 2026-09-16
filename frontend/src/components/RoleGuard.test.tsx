import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleGuard } from './RoleGuard';

const getLoggedUserMock = vi.fn();
const getUserRolesMock = vi.fn();

vi.mock('@ury/core', () => ({
  getLoggedUser: (...args: unknown[]) => getLoggedUserMock(...args),
  getUserRoles: (...args: unknown[]) => getUserRolesMock(...args),
}));

vi.mock('@ury/ui', () => ({
  Spinner: () => <div data-testid="spinner" />,
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
}));

describe('RoleGuard', () => {
  beforeEach(() => {
    cleanup();
    getLoggedUserMock.mockReset();
    getUserRolesMock.mockReset();
  });

  it('renders a spinner before the role check resolves', () => {
    getLoggedUserMock.mockReturnValue(new Promise(() => {})); // never resolves

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('denies access when there is no logged-in user', async () => {
    getLoggedUserMock.mockResolvedValueOnce(null);

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
    expect(getUserRolesMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('grants access when the roles response contains a plain-string "URY Manager" role', async () => {
    getLoggedUserMock.mockResolvedValueOnce('manager@example.com');
    getUserRolesMock.mockResolvedValueOnce({ roles: ['Sales User', 'URY Manager'] });

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    await waitFor(() => expect(screen.getByText('Protected')).toBeInTheDocument());
  });

  it('grants access when a role entry is an object with name "URY Manager"', async () => {
    getLoggedUserMock.mockResolvedValueOnce('manager@example.com');
    getUserRolesMock.mockResolvedValueOnce({ roles: [{ name: 'URY Manager' }] });

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    await waitFor(() => expect(screen.getByText('Protected')).toBeInTheDocument());
  });

  it('denies access when the user has roles but none is URY Manager', async () => {
    getLoggedUserMock.mockResolvedValueOnce('user@example.com');
    getUserRolesMock.mockResolvedValueOnce({ roles: ['Sales User'] });

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
    expect(
      screen.getByText('You need the URY Manager role to access this section.')
    ).toBeInTheDocument();
  });

  it('denies access when roles is missing from the response entirely', async () => {
    getLoggedUserMock.mockResolvedValueOnce('user@example.com');
    getUserRolesMock.mockResolvedValueOnce({});

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
  });

  it('denies access and logs an error when the role check rejects', async () => {
    getLoggedUserMock.mockResolvedValueOnce('user@example.com');
    getUserRolesMock.mockRejectedValueOnce(new Error('network down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RoleGuard>
        <div>Protected</div>
      </RoleGuard>
    );

    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
