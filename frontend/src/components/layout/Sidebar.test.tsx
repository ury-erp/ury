import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const auth = vi.hoisted(() => ({ isManager: false, roles: [] as string[] }));
vi.mock('../../store/useAuth', () => ({ useAuth: () => auth }));
vi.mock('./DayStatusCard', () => ({ DayStatusCard: () => <div data-testid="day-status" /> }));
vi.mock('../../i18n', () => ({ __: (s: string) => s }));

const renderSidebar = () =>
  render(
    <MemoryRouter initialEntries={['/production-board']}>
      <Sidebar />
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('shows only the Production Board to a Department Head who is not a manager', () => {
    auth.isManager = false;
    auth.roles = ['URY Department Head'];
    renderSidebar();
    expect(screen.getByRole('link', { name: /Production Board/ })).toHaveAttribute('href', '/production-board');
    expect(screen.queryByRole('link', { name: /Sales Plan/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Requirements/ })).toBeNull();
    expect(screen.queryByTestId('day-status')).toBeNull();
  });

  it('keeps the full menu, including the Production Board, for a manager', () => {
    auth.isManager = true;
    auth.roles = ['URY Manager'];
    renderSidebar();
    expect(screen.getByRole('link', { name: /Production Board/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sales Plan/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Requirements/ })).toBeInTheDocument();
  });
});
