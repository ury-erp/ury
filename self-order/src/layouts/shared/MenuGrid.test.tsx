import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getItemAvailabilityMock = vi.fn()

vi.mock('../../lib/availability', async () => {
  const actual = await vi.importActual<typeof import('../../lib/availability')>('../../lib/availability')
  return {
    ...actual,
    getItemAvailability: (...args: any[]) => getItemAvailabilityMock(...args),
  }
})

import MenuGrid from './MenuGrid'
import type { MenuItem } from '../../lib/api'

const sellableItem: MenuItem = {
  item: 'ITEM-SELLABLE',
  item_name: 'Veg Fried Rice',
  rate: 180,
  special_dish: 0,
  disabled: 0,
  item_image: null,
  course: null,
  course_label: null,
}

const unavailableItem: MenuItem = {
  item: 'ITEM-UNAVAILABLE',
  item_name: 'Chicken Curry',
  rate: 220,
  special_dish: 0,
  disabled: 0,
  item_image: null,
  course: null,
  course_label: null,
}

describe('MenuGrid availability gating (self-order)', () => {
  beforeEach(() => {
    getItemAvailabilityMock.mockReset()
  })

  it('keeps a sellable item clickable and shows no unavailable badge', async () => {
    getItemAvailabilityMock.mockResolvedValueOnce({
      item_code: sellableItem.item,
      sellable: true,
      available_qty: 4,
      reason_code: 'AVAILABLE',
    })
    const onAdd = vi.fn()

    render(
      <MenuGrid
        menu={[sellableItem]}
        cart={{}}
        capabilities={undefined}
        onAdd={onAdd}
        gridClassName="grid"
        cardClassName="card"
        branch="Kozhikode"
        company="URY"
      />,
    )

    await waitFor(() => expect(getItemAvailabilityMock).toHaveBeenCalled())
    expect(screen.queryByText(/not available|sold out|unavailable/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Veg Fried Rice'))
    expect(onAdd).toHaveBeenCalledWith(sellableItem)
  })

  it('disables an unsellable item and shows its reason-code message', async () => {
    getItemAvailabilityMock.mockResolvedValueOnce({
      item_code: unavailableItem.item,
      sellable: false,
      available_qty: 0,
      reason_code: 'NOT_PRODUCED',
    })
    const onAdd = vi.fn()

    render(
      <MenuGrid
        menu={[unavailableItem]}
        cart={{}}
        capabilities={undefined}
        onAdd={onAdd}
        gridClassName="grid"
        cardClassName="card"
        branch="Kozhikode"
        company="URY"
      />,
    )

    expect(await screen.findByText('Not available today')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Chicken Curry'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('skips the availability check entirely (renders unattenuated) when company is missing', async () => {
    render(
      <MenuGrid
        menu={[sellableItem]}
        cart={{}}
        capabilities={undefined}
        onAdd={vi.fn()}
        gridClassName="grid"
        cardClassName="card"
        branch="Kozhikode"
      />,
    )

    expect(getItemAvailabilityMock).not.toHaveBeenCalled()
  })
})
