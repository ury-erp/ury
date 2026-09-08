import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const freeTable: Table = {
  ...table,
  name: 'T1',
  occupied: 0,
  latest_invoice_time: null,
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

    const card = screen.getByRole('button', { name: /T12/i })
    expect(card.className).toMatch(/min-h-\[11\.5rem\]/)
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

  it('keeps the same height classes for free and occupied cards', () => {
    const { rerender } = render(
      <CaptainTableCard table={freeTable} ownership="free" onTap={() => undefined} />
    )
    const freeCard = screen.getByRole('button', { name: /T1/i })
    expect(freeCard.className).toMatch(/min-h-\[11\.5rem\]/)
    expect(freeCard.querySelector('.invisible')).not.toBeNull()

    rerender(
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
    const occupiedCard = screen.getByRole('button', { name: /T12/i })
    expect(occupiedCard.className).toMatch(/min-h-\[11\.5rem\]/)
  })

  it('exposes transfer actions in the menu for an occupied table', async () => {
    const user = userEvent.setup()
    const onTransferTable = vi.fn()
    const onTransferCaptain = vi.fn()
    const onMenuOpenChange = vi.fn()

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
        menuOpen
        onMenuOpenChange={onMenuOpenChange}
        onMerge={() => undefined}
        onTransferTable={onTransferTable}
        onTransferCaptain={onTransferCaptain}
        showCaptainTransfer
      />
    )

    expect(screen.getByRole('button', { name: 'Transfer table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transfer captain' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Transfer table' }))
    expect(onTransferTable).toHaveBeenCalled()
  })

  it('hides captain transfer without the capability', () => {
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
        menuOpen
        onMenuOpenChange={() => undefined}
        onMerge={() => undefined}
        onTransferTable={() => undefined}
        onTransferCaptain={() => undefined}
        showCaptainTransfer={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Transfer table' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Transfer captain' })).not.toBeInTheDocument()
  })
})
