import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = vi.hoisted(() => ({ isLoading: false, isManager: false }));
vi.mock('../store/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../i18n', () => ({ __: (s: string) => s }));

import { Landing } from './Landing';

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<div>manager dashboard</div>} />
        <Route path="/pos/dashboard" element={<div>pos dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('Landing while /ury/pos is blocked', () => {
  it('shows an access message to a non-manager instead of redirecting to POS', () => {
    auth.isManager = false;
    renderLanding();
    expect(screen.getByText('You do not have access to this page.')).toBeInTheDocument();
    expect(screen.queryByText('pos dashboard')).toBeNull();
  });

  it('still sends a manager to the dashboard', () => {
    auth.isManager = true;
    renderLanding();
    expect(screen.getByText('manager dashboard')).toBeInTheDocument();
  });
});
