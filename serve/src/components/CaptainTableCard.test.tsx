import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CaptainTableCard from './CaptainTableCard'
import type { Table } from '../lib/table-api'

vi.mock('@ury/core', () => ({
  formatCurrency: (n: number) => `₹${n}`,
}))

const table: Table = {
  name: 'T12',
  occupied: 1,
  latest_invoice_time: new Date(Date.now() - 5 * 60_000).toISOString(),
  is_take_away: 0,
  restaurant_room: 'Hall A',
  table_shape: 'Square',
  no_of_seats: 4,
}

describe('CaptainTableCard', () => {
  it('renders a large touch target with readable table identity', () => {
    render(
      <CaptainTableCard
        table={table}
        ownership="mine"
        order={{
          invoiceName: 'INV',
          waiter: 'captain1',
          grandTotal: 250,
          invoicePrinted: false,
        }}
        onTap={() => undefined}
      />
    )

    const button = screen.getByRole('button', { name: /T12/i })
    expect(button.className).toMatch(/min-h-\[9\.5rem\]/)
    expect(screen.getByText('T12').className).toMatch(/text-xl/)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows merge partners and owner for other-captain occupancy', () => {
    render(
      <CaptainTableCard
        table={table}
        ownership="other"
        ownerName="Sam Waiter"
        mergePartners={['T13']}
        order={{
          invoiceName: 'INV',
          waiter: 'sam',
          grandTotal: 90,
          invoicePrinted: false,
        }}
        onTap={() => undefined}
      />
    )

    expect(screen.getByText('+ T13')).toBeInTheDocument()
    expect(screen.getByText('Sam Waiter')).toBeInTheDocument()
  })
})
