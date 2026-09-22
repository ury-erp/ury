import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getItemAvailability = vi.fn()

vi.mock('../lib/availability-api', () => ({
  getItemAvailability: (...args: unknown[]) => getItemAvailability(...args),
  getAvailabilityMessage: (code: string) => (code === 'FG_OUT_OF_STOCK' ? 'Sold out' : 'Unavailable'),
}))

vi.mock('@ury/core', async () => {
  const actual = await vi.importActual<typeof import('@ury/core')>('@ury/core')
  return {
    ...actual,
    formatCurrency: (n: number) => `Rs. ${n}`,
  }
})

import ServeMenuCard from './ServeMenuCard'

describe('ServeMenuCard availability badge', () => {
  beforeEach(() => {
    getItemAvailability.mockReset()
  })

  it('shows “N left” when available_qty is low', async () => {
    getItemAvailability.mockResolvedValue({
      item_code: 'REDBULL',
      sellable: true,
      available_qty: 2,
      reason_code: 'AVAILABLE',
    })

    render(
      <ServeMenuCard
        name="Redbull"
        price={100}
        imageUrl={null}
        item="REDBULL"
        branch="Main"
        company="Demo"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('2 left')).toBeInTheDocument()
    })
  })

  it('skips the availability lookup when branch or company is missing', async () => {
    render(
      <ServeMenuCard name="Redbull" price={100} imageUrl={null} item="REDBULL" branch="Main" />
    )
    expect(getItemAvailability).not.toHaveBeenCalled()
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
  })
})
