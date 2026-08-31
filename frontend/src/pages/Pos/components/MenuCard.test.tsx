import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getItemAvailabilityMock = vi.fn();

vi.mock('../lib/availability-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/availability-api')>('../lib/availability-api');
  return {
    ...actual,
    getItemAvailability: (...args: any[]) => getItemAvailabilityMock(...args),
  };
});

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

import MenuCard from './MenuCard';

const baseProps = {
  id: '1',
  name: 'Chicken Biryani',
  price: 250,
  item_image: null,
  course: 'Main Course',
  item: 'ITEM-BIRYANI',
  branch: 'Kozhikode',
  company: 'URY',
};

describe('MenuCard availability gating', () => {
  beforeEach(() => {
    cleanup();
    getItemAvailabilityMock.mockReset();
  });

  it('stays clickable and shows no badge for a sellable item', async () => {
    getItemAvailabilityMock.mockResolvedValueOnce({
      item_code: 'ITEM-BIRYANI',
      sellable: true,
      available_qty: 5,
      reason_code: 'AVAILABLE',
    });
    const onClick = vi.fn();

    render(<MenuCard {...baseProps} onClick={onClick} />);

    await waitFor(() => expect(getItemAvailabilityMock).toHaveBeenCalled());
    expect(screen.queryByText(/sold out|not available|unavailable/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Chicken Biryani'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the card and shows the reason message for a PLAN_EXHAUSTED item', async () => {
    getItemAvailabilityMock.mockResolvedValueOnce({
      item_code: 'ITEM-BIRYANI',
      sellable: false,
      available_qty: 0,
      reason_code: 'PLAN_EXHAUSTED',
    });
    const onClick = vi.fn();

    render(<MenuCard {...baseProps} onClick={onClick} />);

    expect(await screen.findByText('Sold out')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Chicken Biryani'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
