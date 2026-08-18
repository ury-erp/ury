import {
  Apple,
  Beef,
  Beer,
  Croissant,
  Cake,
  Carrot,
  Coffee,
  Cookie,
  Egg,
  Fish,
  IceCream,
  Milk,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Apple,
  Beef,
  Beer,
  Croissant,
  Cake,
  Carrot,
  Coffee,
  Cookie,
  Egg,
  Fish,
  IceCream,
  Milk,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Wine,
};

export function getCategoryIcon(name?: string): LucideIcon {
  if (!name) return UtensilsCrossed;
  return CATEGORY_ICONS[name] || UtensilsCrossed;
}
