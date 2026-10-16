import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import LoginScreen from './LoginScreen';

const mockLoginWithCredentials = vi.fn();

vi.mock('../store/root-store', () => ({
  useRootStore: () => ({
    loginWithCredentials: mockLoginWithCredentials,
  }),
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form elements with mobile-friendly attributes', () => {
    render(<LoginScreen />);

    const usernameInput = screen.getByLabelText('login.username');
    const passwordInput = screen.getByLabelText('login.password');
    const submitBtn = screen.getByRole('button', { name: 'login.login' });

    expect(usernameInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
    expect(submitBtn).toBeInTheDocument();

    // Tap target & font size classes for mobile
    expect(usernameInput.className).toContain('text-base');
    expect(usernameInput.className).toContain('h-11');
    expect(passwordInput.className).toContain('text-base');
    expect(passwordInput.className).toContain('h-11');
    expect(submitBtn.className).toContain('h-11');
  });

  it('validates empty inputs and shows error banner', async () => {
    render(<LoginScreen />);
    const form = screen.getByRole('button', { name: 'login.login' }).closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('login.error_empty');
    });
    expect(mockLoginWithCredentials).not.toHaveBeenCalled();
  });

  it('calls loginWithCredentials with entered username and password', async () => {
    mockLoginWithCredentials.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginScreen />);

    const usernameInput = screen.getByLabelText('login.username');
    const passwordInput = screen.getByLabelText('login.password');
    const submitBtn = screen.getByRole('button', { name: 'login.login' });

    await user.type(usernameInput, 'waiter@ury.com');
    await user.type(passwordInput, 'secret123');
    await user.click(submitBtn);

    expect(mockLoginWithCredentials).toHaveBeenCalledWith('waiter@ury.com', 'secret123');
  });

  it('displays error message when login fails', async () => {
    mockLoginWithCredentials.mockRejectedValueOnce(new Error('Invalid password'));
    const user = userEvent.setup();
    render(<LoginScreen />);

    const usernameInput = screen.getByLabelText('login.username');
    const passwordInput = screen.getByLabelText('login.password');
    const submitBtn = screen.getByRole('button', { name: 'login.login' });

    await user.type(usernameInput, 'waiter@ury.com');
    await user.type(passwordInput, 'wrongpass');
    await user.click(submitBtn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Invalid password');
    });
  });

  it('toggles password visibility when clicking eye button', async () => {
    const user = userEvent.setup();
    render(<LoginScreen />);

    const passwordInput = screen.getByLabelText('login.password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByRole('button', { name: /hide password/i });
    await user.click(hideBtn);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
