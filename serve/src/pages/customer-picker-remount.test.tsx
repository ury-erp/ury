import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CustomerPicker } from '@ury/ui'

const labels = {
  placeholder: 'Search customer',
  addNew: 'Add customer',
  nameLabel: 'Name',
  phoneLabel: 'Phone',
  addButton: 'Add',
  adding: 'Adding…',
  cancel: 'Cancel',
  noResults: 'No customers found',
  searching: 'Searching…',
  createTitle: 'New customer',
}

/**
 * Regression: defining `<OrderList />` as a nested component remounts on every
 * parent render and wipes CustomerPicker query state. Order.tsx must use
 * `renderOrderList()` (a function call), not a nested component type.
 */
describe('CustomerPicker remount regression (Order list pattern)', () => {
  it('preserves search text across parent re-renders when rendered via helper', async () => {
    const user = userEvent.setup()

    function Parent() {
      const [tick, setTick] = useState(0)
      const [selected, setSelected] = useState<{ id: string; name: string; phone: string } | null>(
        null
      )
      const renderOrderList = () => (
        <CustomerPicker
          value={selected}
          onChange={setSelected}
          results={[]}
          onSearch={() => undefined}
          onCreate={async () => ({ id: 'C1', name: 'A', phone: '' })}
          labels={labels}
        />
      )
      return (
        <div>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            Rerender {tick}
          </button>
          {renderOrderList()}
        </div>
      )
    }

    render(<Parent />)
    const input = screen.getByPlaceholderText('Search customer')
    await user.type(input, 'Ada')
    expect(input).toHaveValue('Ada')
    await user.click(screen.getByRole('button', { name: /Rerender/ }))
    expect(screen.getByPlaceholderText('Search customer')).toHaveValue('Ada')
  })

  it('loses search text when OrderList is a nested component type (anti-pattern)', async () => {
    const user = userEvent.setup()

    function Parent() {
      const [tick, setTick] = useState(0)
      const [selected, setSelected] = useState<{ id: string; name: string; phone: string } | null>(
        null
      )
      // Anti-pattern — new component identity every render.
      const OrderList = () => (
        <CustomerPicker
          value={selected}
          onChange={setSelected}
          results={[]}
          onSearch={() => undefined}
          onCreate={async () => ({ id: 'C1', name: 'A', phone: '' })}
          labels={labels}
        />
      )
      return (
        <div>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            Rerender {tick}
          </button>
          <OrderList />
        </div>
      )
    }

    render(<Parent />)
    const input = screen.getByPlaceholderText('Search customer')
    await user.type(input, 'Ada')
    expect(input).toHaveValue('Ada')
    await user.click(screen.getByRole('button', { name: /Rerender/ }))
    expect(screen.getByPlaceholderText('Search customer')).toHaveValue('')
  })
})
