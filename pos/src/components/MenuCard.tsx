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
}) => {
  const [availability, setAvailability] = useState<ItemAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!branch || !company || !item) {
      setAvailability(null);
      return;
    }
    getItemAvailability({ item_code: item, branch, company })
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item, branch, company]);

  const isUnavailable = !!availability && (!availability.sellable || availability.available_qty <= 0);
  const unavailableMessage = isUnavailable ? getAvailabilityMessage(availability?.reason_code) : null;

  return (
    <MenuItemCard
      name={name}
      priceLabel={formatCurrency(price)}
      imageUrl={item_image}
      course={course}
      onClick={onClick}
      disabled={disabled}
      unavailableMessage={unavailableMessage}
    />
  );
};

export default MenuCard;
