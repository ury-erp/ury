import { useEffect, useState } from 'react';
import {
  Apple,
  Banana,
  Beef,
  Beer,
  Blend,
  BottleWine,
  BrushCleaning,
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
  Pizza,
  Popcorn,
  Popsicle,
  Refrigerator,
  Salad,
  Sandwich,
  Shell,
  ShoppingBag,
  Shrimp,
  Snail,
  Soup,
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
  Blend,
  BottleWine,
  BrushCleaning,
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
  Pizza,
  Popcorn,
  Popsicle,
  Refrigerator,
  Salad,
  Sandwich,
  Shell,
  ShoppingBag,
  Shrimp,
  Snail,
  Soup,
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

  // Split into tokens so compound names like "Chicken Pizza" or "Smash Burger"
  // are evaluated word-by-word. Rules are ordered from most specific dish type
  // to broad ingredient/descriptor so the dominant term wins.
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return undefined;

  const matches = (pattern: string | RegExp) => {
    if (typeof pattern === 'string') {
      return tokens.some((token) => token.includes(pattern));
    }
    // Test both whole phrase (handles hyphenated/compound names like
    // "add-ons" or "ice-cream") and individual tokens.
    return pattern.test(normalized) || tokens.some((token) => pattern.test(token));
  };

  const rules: Array<[string | RegExp, string | undefined]> = [
    // Specific dishes / preparations
    [/\bice[- ]?creams?\b/, 'IceCreamCone'],
    [/\bpizzas?\b/, 'Pizza'],
    [/\bburgers?\b/, 'Hamburger'],
    [/\bhamburgers?\b/, 'Hamburger'],
    [/\bsandwiches?\b/, 'Sandwich'],
    [/\bsoups?\b/, 'Soup'],
    [/\bsalads?\b/, 'Salad'],
    // Drinks
    [/\bcoffees?\b/, 'Coffee'],
    [/\btea\b/, 'Coffee'],
    [/\bmilk[- ]?shakes?\b/, 'Milk'],
    [/\bsmoothies?\b/, 'Milk'],
    [/\bmilk\b/, 'Milk'],
    [/\bsoft[- ]?drinks?\b/, 'CupSoda'],
    [/\bsodas?\b/, 'CupSoda'],
    [/\bjuices?\b/, 'CupSoda'],
    [/\bwater\b/, 'GlassWater'],
    [/\bbeers?\b/, 'Beer'],
    [/\bwines?\b/, 'Wine'],
    [/\bcocktails?\b/, 'Martini'],
    [/\bmartinis?\b/, 'Martini'],
    [/\bwhisky\b/, 'Wine'],
    [/\bwhiskey\b/, 'Wine'],
    [/\brum\b/, 'Wine'],
    [/\bvodka\b/, 'Wine'],
    [/\bsake\b/, 'Wine'],
    [/\bdrinks?\b/, 'CupSoda'],
    [/\bbeverages?\b/, 'Coffee'],
    // Desserts / baked goods
    [/\bcake[- ]?slices?\b/, 'CakeSlice'],
    [/\bcakes?\b/, 'Cake'],
    [/\bpies?\b/, 'Cake'],
    [/\bcroissants?\b/, 'Croissant'],
    [/\bbreads?\b/, 'Croissant'],
    [/\bdoughnut\b/, 'Donut'],
    [/\bdonuts?\b/, 'Donut'],
    [/\bcandy[- ]?canes?\b/, 'CandyCane'],
    [/\bcandies\b/, 'Candy'],
    [/\bcandy\b/, 'Candy'],
    [/\blollipops?\b/, 'Lollipop'],
    [/\bchocolates?\b/, 'Candy'],
    [/\bcookies?\b/, 'Cookie'],
    [/\bpopcorn\b/, 'Popcorn'],
    [/\bpopsicles?\b/, 'Popsicle'],
    [/\bdesserts?\b/, 'Dessert'],
    // Proteins / ingredients
    [/\bshrimps?\b/, 'Shrimp'],
    [/\bseafood\b/, 'Fish'],
    [/\bfishes?\b/, 'Fish'],
    [/\bfish\b/, 'Fish'],
    [/\bgrill(ed|ing)?\b/, 'CookingPot'],
    [/\bbarbecue\b/, 'CookingPot'],
    [/\bbbq\b/, 'CookingPot'],
    [/\b(fry|fried)\b/, 'CookingPot'],
    [/\broast(ed|ing)?\b/, 'CookingPot'],
    [/\bchickens?\b/, 'Drumstick'],
    [/\bpoultry\b/, 'Drumstick'],
    [/\bsteaks?\b/, 'Beef'],
    [/\bbeef\b/, 'Beef'],
    [/\bpork\b/, 'Beef'],
    [/\bmeats?\b/, 'Beef'],
    [/\beggs?\b/, 'EggFried'],
    [/\bomelettes?\b/, 'EggFried'],
    [/\bnuts?\b/, 'Nut'],
    // Produce
    [/\bgrapes?\b/, 'Grape'],
    [/\bcherries\b/, 'Cherry'],
    [/\bcherry\b/, 'Cherry'],
    [/\bapples?\b/, 'Apple'],
    [/\bbananas?\b/, 'Banana'],
    [/\bcitrus\b/, 'Citrus'],
    [/\blemons?\b/, 'Citrus'],
    [/\boranges?\b/, 'Citrus'],
    [/\bcarrots?\b/, 'Carrot'],
    [/\bvegetables?\b/, 'LeafyGreen'],
    [/\bbroccoli\b/, 'LeafyGreen'],
    [/\bleafy[- ]?greens?\b/, 'LeafyGreen'],
    [/\bfruits?\b/, 'Apple'],
    [/\bvegan\b/, 'Vegan'],
    // Service / course descriptors
    [/\badd[- ]?ons?\b/, 'Cookie'],
    [/\baddon\b/, 'Cookie'],
    [/\bpaper[- ]?bags?\b/, 'ShoppingBag'],
    [/\bshopping[- ]?bags?\b/, 'ShoppingBag'],
    [/\bbuffets?\b/, 'HandPlatter'],
    [/\bstarters?\b/, 'EggFried'],
    [/\bmain\b/, 'Utensils'],
    [/\bcourses?\b/, 'Utensils'],
    [/\bseasonal\b/, 'LeafyGreen'],
    [/\bblenders?\b/, 'Blend'],
    [/\bmicrowaves?\b/, 'Microwave'],
    [/\brefrigerators?\b/, 'Refrigerator'],
    [/\bcooking[- ]?pots?\b/, 'CookingPot'],
  ];

  for (const [pattern, iconName] of rules) {
    if (matches(pattern) && iconName) {
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
