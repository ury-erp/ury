import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const splitBillMock = vi.fn()

vi.mock('../lib/order-api', () => ({
  splitBill: (...args: unknown[]) => splitBillMock(...args),
}))

import { SplitOrderDialog } from './SplitOrderDialog'

const items = [
  { name: 'row-a', item_name: 'Biryani', qty: 2, item_code: 'ITEM-B' },
  { name: 'row-b', item_name: 'Lassi', qty: 1, item_code: 'ITEM-L' },
  // Duplicate row name must be ignored.
  { name: 'row-a', item_name: 'Biryani dup', qty: 9, item_code: 'ITEM-B' },
]

describe('SplitOrderDialog', () => {
  beforeEach(() => {
    splitBillMock.mockReset()
  })

  it('shows item names, dedupes rows, and requires remaining source qty', async () => {
    const user = userEvent.setup()
    render(
      <SplitOrderDialog
        open
        onOpenChange={vi.fn()}
        invoiceId="POS-INV-1"
        items={items}
      />
    )

    expect(screen.getByText('Biryani')).toBeInTheDocument()
    expect(screen.getByText('Lassi')).toBeInTheDocument()
    expect(screen.queryByText('Biryani dup')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Move qty')).toHaveLength(2)

    const splitBtn = screen.getByRole('button', { name: 'Split bill' })
    expect(splitBtn).toBeDisabled()

    const inputs = screen.getAllByLabelText('Move qty')
    await user.clear(inputs[0])
    await user.type(inputs[0], '2')
    await user.clear(inputs[1])
    await user.type(inputs[1], '1')

    expect(await screen.findByText(/Leave at least some quantity/i)).toBeInTheDocument()
    expect(splitBtn).toBeDisabled()
  })

  it('allows fractional move on qty-1 lines and calls splitBill with row names', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()
    splitBillMock.mockResolvedValue({
      source_invoice: 'POS-INV-1',
      new_invoice: 'POS-INV-2',
    })

    render(
      <SplitOrderDialog
        open
        onOpenChange={onOpenChange}
        invoiceId="POS-INV-1"
        items={items}
        customerId="CUST-00042"
        onSuccess={onSuccess}
      />
    )

    const inputs = screen.getAllByLabelText('Move qty')
    await user.clear(inputs[0])
    await user.type(inputs[0], '0.5')
    await user.clear(inputs[1])
    await user.type(inputs[1], '0.25')

    const review = screen.getByText(/Moving to new invoice/i).closest('div')
    expect(review).toBeTruthy()
    expect(within(review as HTMLElement).getByText(/Biryani: 0.5/)).toBeInTheDocument()
    expect(within(review as HTMLElement).getByText(/Lassi: 0.25/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Split bill' }))

    await waitFor(() => expect(splitBillMock).toHaveBeenCalledTimes(1))
    expect(splitBillMock).toHaveBeenCalledWith(
      'POS-INV-1',
      [
        { name: 'row-a', qty: 0.5 },
        { name: 'row-b', qty: 0.25 },
      ],
      'CUST-00042'
    )
    expect(onSuccess).toHaveBeenCalledWith({
      source_invoice: 'POS-INV-1',
      new_invoice: 'POS-INV-2',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the dialog open and shows the error when splitBill rejects', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    splitBillMock.mockRejectedValue(new Error('At least one item must remain on the original bill.'))

    render(
      <SplitOrderDialog
        open
        onOpenChange={onOpenChange}
        invoiceId="POS-INV-1"
        items={[{ name: 'row-a', item_name: 'Biryani', qty: 2 }]}
      />
    )

    const input = screen.getByLabelText('Move qty')
    await user.clear(input)
    await user.type(input, '1')
    await user.click(screen.getByRole('button', { name: 'Split bill' }))

    expect(
      await screen.findByText(/At least one item must remain on the original bill/i)
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
