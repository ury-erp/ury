import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProductCard from './ProductCard'
import type { MenuItem } from '../../lib/api'

const baseItem = {
  item_name: 'Margherita Pizza',
  rate: 350,
  item_image: '/images/pizza.jpg',
} as MenuItem

describe('ProductCard', () => {
  it('renders the item name and price', () => {
    render(<ProductCard item={baseItem} cartQty={0} showImage={false} onClick={() => {}} />)

    expect(screen.getByText('Margherita Pizza')).toBeInTheDocument()
    expect(screen.getByText('350')).toBeInTheDocument()
  })

  it('shows the item image when showImage is true and an image is set', () => {
    render(<ProductCard item={baseItem} cartQty={0} showImage={true} onClick={() => {}} />)

    const img = screen.getByAltText('Margherita Pizza')
    expect(img).toHaveAttribute('src', '/images/pizza.jpg')
  })

  it('does not render an image when showImage is false', () => {
    render(<ProductCard item={baseItem} cartQty={0} showImage={false} onClick={() => {}} />)

    expect(screen.queryByAltText('Margherita Pizza')).not.toBeInTheDocument()
  })

  it('shows the in-cart quantity badge when cartQty is greater than zero', () => {
    render(<ProductCard item={baseItem} cartQty={2} showImage={false} onClick={() => {}} />)

    expect(screen.getByText('In cart: 2')).toBeInTheDocument()
  })

  it('does not show the in-cart badge when cartQty is zero', () => {
    render(<ProductCard item={baseItem} cartQty={0} showImage={false} onClick={() => {}} />)

    expect(screen.queryByText(/In cart:/)).not.toBeInTheDocument()
  })

  it('calls onClick when clicked and not disabled', () => {
    const onClick = vi.fn()
    render(<ProductCard item={baseItem} cartQty={0} showImage={false} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <ProductCard item={baseItem} cartQty={0} showImage={false} onClick={onClick} disabled />
    )

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows the unavailable message instead of the cart badge when disabled', () => {
    render(
      <ProductCard
        item={baseItem}
        cartQty={3}
        showImage={false}
        onClick={() => {}}
        disabled
        unavailableMessage="Out of stock"
      />
    )

    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    expect(screen.queryByText(/In cart:/)).not.toBeInTheDocument()
  })

  it('marks the button as disabled and aria-disabled when disabled', () => {
    render(
      <ProductCard item={baseItem} cartQty={0} showImage={false} onClick={() => {}} disabled />
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })
})
