import { useEffect, useState } from 'react'
import { MenuItemCard } from '@ury/ui'
import { formatCurrency } from '@ury/core'
import {
  getAvailabilityMessage,
  getItemAvailability,
  type ItemAvailability,
} from '../lib/availability-api'

interface Props {
  name: string
  price: number
  imageUrl: string | null
  course?: string
  item: string
  disabled?: boolean
  branch?: string | null
  company?: string | null
  onClick?: () => void
  onConfigure?: () => void
  quantity?: number
  onIncrement?: () => void
  onDecrement?: () => void
  incrementDisabled?: boolean
  decrementDisabled?: boolean
}

/** Menu card with optional availability badge (display-only; sync_order is authority). */
export default function ServeMenuCard({
  name,
  price,
  imageUrl,
  course,
  item,
  disabled,
  branch,
  company,
  onClick,
  onConfigure,
  quantity,
  onIncrement,
  onDecrement,
  incrementDisabled,
  decrementDisabled,
}: Props) {
  const [availability, setAvailability] = useState<ItemAvailability | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!branch || !company || !item) {
      setAvailability(null)
      return
    }
    getItemAvailability({ item_code: item, branch, company })
      .then((result) => {
        if (!cancelled) setAvailability(result)
      })
      .catch(() => {
        if (!cancelled) setAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [item, branch, company])

  const isUnavailable =
    !!availability && (!availability.sellable || availability.available_qty <= 0)
  const unavailableMessage = isUnavailable
    ? getAvailabilityMessage(availability?.reason_code)
    : null

  return (
    <MenuItemCard
      name={name}
      priceLabel={formatCurrency(price)}
      imageUrl={imageUrl}
      course={course}
      onClick={onClick}
      onConfigure={onConfigure}
      disabled={disabled}
      unavailableMessage={unavailableMessage}
      quantity={quantity}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      incrementDisabled={incrementDisabled}
      decrementDisabled={decrementDisabled}
    />
  )
}
