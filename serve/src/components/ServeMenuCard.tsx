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

function getAvailabilityTag(
  availability: ItemAvailability | null,
  unavailableMessage: string | null
): {
  variant: 'tagDestructive' | 'tagWarning' | 'tagSuccess'
  text: string
  showDot: boolean
} | null {
  if (!availability) return null

  if (
    !availability.sellable ||
    (availability.available_qty != null && availability.available_qty <= 0)
  ) {
    return {
      variant: 'tagDestructive',
      text: unavailableMessage || 'Unavailable',
      showDot: false,
    }
  }

  if (availability.available_qty != null && availability.available_qty < 5) {
    return {
      variant: 'tagWarning',
      text: `${availability.available_qty} left`,
      showDot: false,
    }
  }

  if (availability.available_qty == null) {
    return { variant: 'tagSuccess', text: 'Available', showDot: true }
  }

  return {
    variant: 'tagSuccess',
    text: `${availability.available_qty} left`,
    showDot: true,
  }
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

  // `available_qty == null` means unconstrained — never treat as out of stock.
  const isUnavailable =
    !!availability &&
    (!availability.sellable ||
      (availability.available_qty != null && availability.available_qty <= 0))
  const unavailableMessage = isUnavailable
    ? getAvailabilityMessage(availability?.reason_code)
    : null
  const availabilityTag = getAvailabilityTag(availability, unavailableMessage)

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
      availabilityTag={availabilityTag}
      quantity={quantity}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      incrementDisabled={incrementDisabled}
      decrementDisabled={decrementDisabled}
    />
  )
}
