import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { PerformerSelect } from './PerformerSelect';

const storeState: any = {
  posProfile: null,
  selectedPerformer: null,
  setSelectedPerformer: vi.fn(),
  isUpdatingOrder: false,
};

let currentUser: any = { name: 'manager1', roles: ['URY Manager'] };

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => storeState,
}));

vi.mock('../store/root-store', () => ({
  useRootStore: (selector: any) => selector({ user: currentUser }),
}));

const listEligiblePerformers = vi.fn();
vi.mock('../lib/order-attribution-api', () => ({
  listEligiblePerformers: (...args: unknown[]) => listEligiblePerformers(...args),
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('@ury/ui', () => ({
  Select: ({ children, ...props }: any) => <select {...props}>{children}</select>,
  SelectItem: ({ children, ...props }: any) => <option {...props}>{children}</option>,
}));

vi.mock('@ury/core', () => ({
  canOrderOnBehalf: (user: any, profile: any) => {
    if (!user?.roles || !profile?.custom_enable_order_on_behalf) return false;
    const allowed = (profile.custom_roles_allowed_to_order_on_behalf ?? []).map(
      (row: any) => row.role
    );
    return user.roles.some((role: string) => allowed.includes(role));
  },
}));

const enabledProfile = {
  name: 'prof1',
  custom_enable_order_on_behalf: 1,
  custom_roles_allowed_to_order_on_behalf: [{ role: 'URY Manager' }],
};

describe('PerformerSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEligiblePerformers.mockResolvedValue([
      { name: 'EMP-1', employee_name: 'Washer One', designation: 'Car Washer' },
    ]);
    currentUser = { name: 'manager1', roles: ['URY Manager'] };
    storeState.posProfile = enabledProfile;
    storeState.selectedPerformer = null;
  });

  it('renders nothing when the profile has the feature off', () => {
    storeState.posProfile = { ...enabledProfile, custom_enable_order_on_behalf: 0 };
    const { container } = render(<PerformerSelect />);
    expect(container).toBeEmptyDOMElement();
    expect(listEligiblePerformers).not.toHaveBeenCalled();
  });

  it('renders nothing when the user lacks a permitted role', () => {
    currentUser = { name: 'captain1', roles: ['URY Captain'] };
    const { container } = render(<PerformerSelect />);
    expect(container).toBeEmptyDOMElement();
    expect(listEligiblePerformers).not.toHaveBeenCalled();
  });

  it('lists eligible employees for a permitted user', async () => {
    render(<PerformerSelect />);
    await waitFor(() => {
      expect(screen.getByText(/Washer One/)).toBeInTheDocument();
    });
    expect(listEligiblePerformers).toHaveBeenCalledWith('prof1');
  });

  it('offers a blank option only when a performer is not required', async () => {
    render(<PerformerSelect />);
    await waitFor(() => expect(screen.getByText('order.no_performer')).toBeInTheDocument());
  });

  it('omits the blank option when the profile requires a performer', async () => {
    storeState.posProfile = { ...enabledProfile, custom_require_performer_on_order: 1 };
    render(<PerformerSelect />);
    await waitFor(() => expect(screen.getByText(/Washer One/)).toBeInTheDocument());
    expect(screen.queryByText('order.no_performer')).not.toBeInTheDocument();
  });

  it('shows no options when the lookup fails', async () => {
    listEligiblePerformers.mockRejectedValue(new Error('denied'));
    render(<PerformerSelect />);
    await waitFor(() => expect(listEligiblePerformers).toHaveBeenCalled());
    expect(screen.queryByText(/Washer One/)).not.toBeInTheDocument();
  });
});
