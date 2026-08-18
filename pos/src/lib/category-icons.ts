import { useEffect, useState } from 'react';
import {
  Apple,
  Banana,
  Beef,
  Beer,
  Blender,
  BottleWine,
  Broccoli,
  BrushCleaning,
  Burger,
  Cake,
  CakeSlice,
  Candy,
  CandyCane,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Dessert,
  Donut,
  Drumstick,
  Egg,
  EggFried,
  Fish,
  FishSymbol,
  GlassWater,
  Grape,
  Hamburger,
  HandPlatter,
  Hop,
  IceCreamBowl,
  IceCreamCone,
  LeafyGreen,
  Lollipop,
  Martini,
  Milk,
  Microwave,
  Nut,
  PaperBag,
  Pizza,
  Popcorn,
  Popsicle,
  Refrigerator,
  Salad,
  Sandwich,
  Shell,
  Shrimp,
  Snail,
  Soup,
  Taco,
  Torus,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Wheat,
  WheatOff,
  Wine,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Apple,
  Banana,
  Beef,
  Beer,
  Blender,
  BottleWine,
  Broccoli,
  BrushCleaning,
  Burger,
  Cake,
  CakeSlice,
  Candy,
  CandyCane,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Dessert,
  Donut,
  Drumstick,
  Egg,
  EggFried,
  Fish,
  FishSymbol,
  GlassWater,
  Grape,
  Hamburger,
  HandPlatter,
  Hop,
  IceCreamBowl,
  IceCreamCone,
  LeafyGreen,
  Lollipop,
  Martini,
  Milk,
  Microwave,
  Nut,
  PaperBag,
  Pizza,
  Popcorn,
  Popsicle,
  Refrigerator,
  Salad,
  Sandwich,
  Shell,
  Shrimp,
  Snail,
  Soup,
  Taco,
  Torus,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Wheat,
  WheatOff,
  Wine,
};

const iconCache = new Map<string, LucideIcon | undefined>();

async function importLucideIcon(name: string): Promise<LucideIcon | undefined> {
  if (iconCache.has(name)) {
    return iconCache.get(name);
  }

  try {
    const module = await import('lucide-react');
    const icon = (module as Record<string, unknown>)[name] as LucideIcon | undefined;
    iconCache.set(name, icon);
    return icon;
  } catch {
    iconCache.set(name, undefined);
    return undefined;
  }
}

export function fuzzyMatchIcon(courseName?: string): string | undefined {
  if (!courseName) return undefined;

  const normalized = courseName.trim().toLowerCase();
  if (!normalized) return undefined;

  // Match from most specific phrases to broad keywords.
  const rules: Array<[string | RegExp, string]> = [
    [/\bice[- ]?cream\b/, 'IceCreamCone'],
    [/\bsoft[- ]?drink\b/, 'CupSoda'],
    [/\badd[- ]?ons?\b/, 'Cookie'],
    [/\baddon\b/, 'Cookie'],
    [/\bbuffets?\b/, 'HandPlatter'],
    [/\bstarters?\b/, 'EggFried'],
    [/\bdesserts?\b/, 'Cake'],
    [/\bbeverages?\b/, 'Coffee'],
    [/\bdrink\b/, 'Coffee'],
    [/\bvegetables?\b/, 'Carrot'],
    [/\bfruits?\b/, 'Apple'],
    [/\bchicken\b/, 'Drumstick'],
    [/\bpoultry\b/, 'Drumstick'],
    [/\bbeef\b/, 'Beef'],
    [/\bmeat\b/, 'Beef'],
    [/\bvegan\b/, 'Vegan'],
    [/\bshrimp\b/, 'Shrimp'],
    [/\bfish\b/, 'Fish'],
    [/\bwine\b/, 'Wine'],
    [/\bbeer\b/, 'Beer'],
    [/\bsoda\b/, 'CupSoda'],
    [/\bmilk\b/, 'Milk'],
    [/\bcoffee\b/, 'Coffee'],
    [/\bpizza\b/, 'Pizza'],
    [/\bsoups?\b/, 'Soup'],
    [/\bsalads?\b/, 'Salad'],
    [/\bbread\b/, 'Croissant'],
    [/\bcroissant\b/, 'Croissant'],
    [/\bcake\b/, 'Cake'],
    [/\bmain\b/, 'Utensils'],
    [/\bcourses?\b/, 'Utensils'],
    [/\bbuffet\b/, 'HandPlatter'],
    [/\bseasonal\b/, 'LeafyGreen'],
  ];

  for (const [pattern, iconName] of rules) {
    if (typeof pattern === 'string') {
      if (normalized.includes(pattern)) return iconName;
    } else if (pattern.test(normalized)) {
      return iconName;
    }
  }

  return undefined;
}

interface CategoryIconProps {
  name?: string;
  courseName?: string;
  className?: string;
}

export function CategoryIcon({ name, courseName, className }: CategoryIconProps) {
  const [ResolvedIcon, setResolvedIcon] = useState<LucideIcon | undefined>(() => {
    if (name) return CATEGORY_ICONS[name] ?? undefined;
    const fallback = fuzzyMatchIcon(courseName);
    return fallback ? CATEGORY_ICONS[fallback] ?? undefined : undefined;
  });

  useEffect(() => {
    let cancelled = false;

    async function resolveIcon() {
      const iconName = name?.trim() || fuzzyMatchIcon(courseName);
      if (!iconName) {
        if (!cancelled) setResolvedIcon(undefined);
        return;
      }

      if (CATEGORY_ICONS[iconName]) {
        if (!cancelled) setResolvedIcon(CATEGORY_ICONS[iconName]);
        return;
      }

      const dynamicIcon = await importLucideIcon(iconName);
      if (!cancelled) setResolvedIcon(dynamicIcon);
    }

    resolveIcon();

    return () => {
      cancelled = true;
    };
  }, [name, courseName]);

  const IconComponent = ResolvedIcon || UtensilsCrossed;
  return <IconComponent className={className} />;
}
