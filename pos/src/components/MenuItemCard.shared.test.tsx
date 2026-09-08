import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MenuItemCard, ProductConfigurator } from '@ury/ui'

describe('MenuItemCard image fallback', () => {
  it('shows name initials when the image fails to load', async () => {
    render(
      <MenuItemCard
        name="Chicken Biryani"
        priceLabel="Rs. 250"
        imageUrl="https://example.com/broken.jpg"
        course="Main"
      />
    )

    const img = screen.getByRole('img', { name: 'Chicken Biryani' })
    img.dispatchEvent(new Event('error'))

    await vi.waitFor(() => {
      expect(screen.queryByRole('img', { name: 'Chicken Biryani' })).not.toBeInTheDocument()
      expect(screen.getByText('CH')).toBeInTheDocument()
    })
  })

  it('renders initials immediately when imageUrl is missing', () => {
    render(<MenuItemCard name="Dal Makhani" priceLabel="Rs. 180" />)
    expect(screen.getByText('DA')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('MenuItemCard quantity steppers', () => {
  it('shows accessible plus/minus when quantity is positive', async () => {
    const user = userEvent.setup()
    const onIncrement = vi.fn()
    const onDecrement = vi.fn()
    const onClick = vi.fn()

    render(
      <MenuItemCard
        name="Paneer Tikka"
        priceLabel="Rs. 220"
        quantity={2}
        onClick={onClick}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />
    )

    expect(screen.getByRole('group', { name: 'Paneer Tikka quantity 2' })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Increase Paneer Tikka' }))
    await user.click(screen.getByRole('button', { name: 'Decrease Paneer Tikka' }))

    expect(onIncrement).toHaveBeenCalledTimes(1)
    expect(onDecrement).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disables decrement when decrementDisabled is set', () => {
    render(
      <MenuItemCard
        name="Naan"
        priceLabel="Rs. 40"
        quantity={1}
        onIncrement={() => undefined}
        onDecrement={() => undefined}
        decrementDisabled
      />
    )

    expect(screen.getByRole('button', { name: 'Decrease Naan' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase Naan' })).toBeEnabled()
  })

  it('hides steppers when quantity is zero', () => {
    render(<MenuItemCard name="Raita" priceLabel="Rs. 60" quantity={0} />)
    expect(screen.queryByRole('button', { name: 'Increase Raita' })).not.toBeInTheDocument()
  })

  it('places quantity controls at the bottom-end corner', () => {
    render(
      <MenuItemCard
        name="Soup"
        priceLabel="Rs. 90"
        quantity={1}
        onIncrement={() => undefined}
        onDecrement={() => undefined}
      />
    )
    const group = screen.getByRole('group', { name: 'Soup quantity 1' })
    expect(group.className).toMatch(/absolute/)
    expect(group.className).toMatch(/bottom-2/)
    expect(group.className).toMatch(/end-2/)
  })
})

describe('MenuItemCard configure gestures', () => {
  it('announces options and opens on Shift+Enter without quick-add', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const onConfigure = vi.fn()
    render(
      <MenuItemCard name="Kebab" priceLabel="Rs. 200" onClick={onClick} onConfigure={onConfigure} />
    )

    const card = screen.getByRole('button', { name: /Kebab/ })
    expect(card).toHaveAccessibleName('Kebab. Options available')
    expect(card).toHaveAttribute('aria-keyshortcuts', 'Shift+Enter')

    card.focus()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onConfigure).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ProductConfigurator mobile image sizing', () => {
  const labels = {
    specialInstructions: 'Special instructions',
    specialInstructionsPlaceholder: 'Notes…',
    quantity: 'Quantity',
    variants: 'Variants',
    addons: 'Add-ons',
    loadingAddons: 'Loading…',
    noAddons: 'No add-ons',
    total: 'Total',
    submit: 'Add to order',
  }

  it('uses constrained mobile image height instead of min-h-96', () => {
    render(
      <ProductConfigurator
        open
        onOpenChange={() => undefined}
        itemName="Mutton Rogan Josh"
        itemCode="ITEM-RJ"
        imageUrl="https://example.com/rogan.jpg"
        quantity="1"
        onQuantityChange={() => undefined}
        onIncrement={() => undefined}
        onDecrement={() => undefined}
        comments=""
        onCommentsChange={() => undefined}
        variants={[]}
        onSelectVariant={() => undefined}
        addons={[]}
        selectedAddonIds={[]}
        onToggleAddon={() => undefined}
        totalLabel="Rs. 380"
        onSubmit={() => undefined}
        labels={labels}
      />
    )

    const img = screen.getByRole('img', { name: 'Mutton Rogan Josh' })
    expect(img.className).toMatch(/h-full/)
    expect(img.className).not.toMatch(/min-h-96/)
    expect(img.parentElement?.className).toMatch(/h-40/)
    expect(img.parentElement?.className).not.toMatch(/min-h-96/)
  })

  it('exposes labeled quantity controls at touch-friendly size', () => {
    render(
      <ProductConfigurator
        open
        onOpenChange={() => undefined}
        itemName="Gulab Jamun"
        itemCode="ITEM-GJ"
        quantity="2"
        onQuantityChange={() => undefined}
        onIncrement={() => undefined}
        onDecrement={() => undefined}
        comments=""
        onCommentsChange={() => undefined}
        variants={[]}
        onSelectVariant={() => undefined}
        addons={[]}
        selectedAddonIds={[]}
        onToggleAddon={() => undefined}
        totalLabel="Rs. 120"
        onSubmit={() => undefined}
        labels={labels}
      />
    )

    expect(screen.getByRole('button', { name: 'Decrease Quantity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase Quantity' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(2)
  })
})

describe('SegmentedControl a11y', () => {
  it('exposes radiogroup semantics with aria-checked', async () => {
    const { SegmentedControl } = await import('@ury/ui')
    const onChange = vi.fn()
    render(
      <SegmentedControl
        aria-label="View"
        value="list"
        onChange={onChange}
        options={[
          { value: 'list', label: 'List' },
          { value: 'grid', label: 'Grid' },
        ]}
      />
    )

    const group = screen.getByRole('radiogroup', { name: 'View' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'false')
  })
})
