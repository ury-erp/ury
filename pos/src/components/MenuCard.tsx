import { FC, useEffect, useState } from 'react';
import { MenuItemCard } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import {
  getAvailabilityMessage,
  getItemAvailability,
  ItemAvailability,
} from '../lib/availability-api';

interface MenuCardProps {
  id: string;
  name: string;
  price: number;
  item_image: string | null;
  course?: string;
  item: string;
  onClick?: () => void;
  disabled?: boolean;
  branch?: string;
  company?: string;
  availability?: ItemAvailability | null;
}

const MenuCard: FC<MenuCardProps> = ({
  name,
  price,
  item_image,
  course,
  item,
  onClick,
  disabled,
  branch,
  company,
  availability: propAvailability,
}) => {
  const [internalAvailability, setInternalAvailability] = useState<ItemAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (propAvailability !== undefined) {
      return;
    }
    if (!branch || !company || !item) {
      setInternalAvailability(null);
      return;
    }
    getItemAvailability({ item_code: item, branch, company })
      .then((result) => {
        if (!cancelled) setInternalAvailability(result);
      })
      .catch(() => {
        if (!cancelled) setInternalAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item, branch, company, propAvailability]);

  const availability = propAvailability !== undefined ? propAvailability : internalAvailability;

  // `available_qty == null` means "unconstrained" (e.g. an "Always
  // Available" override) -- never treat it as zero/out-of-stock.
  const isUnavailable =
    !!availability &&
    (!availability.sellable ||
      (availability.available_qty != null && availability.available_qty <= 0));
  const unavailableMessage = isUnavailable
    ? getAvailabilityMessage(availability?.reason_code)
    : null;

  // Determine badge variant and text for availability status
  const getAvailabilityTag = (): {
    variant: 'tagDestructive' | 'tagWarning' | 'tagSuccess';
    text: string;
    showDot: boolean;
  } | null => {
    if (!availability) return null;

    if (
      !availability.sellable ||
      (availability.available_qty != null && availability.available_qty <= 0)
    ) {
      return {
        variant: 'tagDestructive',
        text: unavailableMessage || 'Unavailable',
        showDot: false,
      };
    }

    if (availability.available_qty != null && availability.available_qty < 5) {
      return {
        variant: 'tagWarning',
        text: `${availability.available_qty} left`,
        showDot: false,
      };
    }

    if (availability.available_qty == null) {
      return { variant: 'tagSuccess', text: 'Available', showDot: true };
    }

    return {
      variant: 'tagSuccess',
      text: `${availability.available_qty} left`,
      showDot: true,
    };
  };

  const availabilityTag = getAvailabilityTag();

  return (
    <MenuItemCard
      name={name}
      priceLabel={formatCurrency(price)}
      imageUrl={item_image}
      course={course}
      onClick={onClick}
      disabled={disabled || isUnavailable}
      availabilityTag={availabilityTag}
    />
  );
};

export default MenuCard;
