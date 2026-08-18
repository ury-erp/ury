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

  const matches = (pattern: string | RegExp) =>
    tokens.some((token) =>
      typeof pattern === 'string' ? token.includes(pattern) : pattern.test(token),
    );

  const rules: Array<[string | RegExp, string | undefined]> = [
    // Specific dishes / preparations
    [/\bice[- ]?cream\b/, 'IceCreamCone'],
    [/\bpizza\b/, 'Pizza'],
    [/\bburger\b/, 'Hamburger'],
    [/\bhamburger\b/, 'Hamburger'],
    [/\bsandwich\b/, 'Sandwich'],
    [/\bsoups?\b/, 'Soup'],
    [/\bsalads?\b/, 'Salad'],
    // Drinks
    [/\bcoffee\b/, 'Coffee'],
    [/\btea\b/, 'Coffee'],
    [/\bmilk[- ]?shake\b/, 'Milk'],
    [/\bsmoothie\b/, 'Milk'],
    [/\bmilk\b/, 'Milk'],
    [/\bsoft[- ]?drink\b/, 'CupSoda'],
    [/\bsoda\b/, 'CupSoda'],
    [/\bjuice\b/, 'CupSoda'],
    [/\bwater\b/, 'GlassWater'],
    [/\bbeer\b/, 'Beer'],
    [/\bwine\b/, 'Wine'],
    [/\bcocktail\b/, 'Martini'],
    [/\bmartini\b/, 'Martini'],
    [/\bwhisky\b/, 'Wine'],
    [/\bwhiskey\b/, 'Wine'],
    [/\brum\b/, 'Wine'],
    [/\bvodka\b/, 'Wine'],
    [/\bsake\b/, 'Wine'],
    [/\bdrink\b/, 'CupSoda'],
    [/\bbeverage\b/, 'Coffee'],
    // Desserts / baked goods
    [/\bcake[- ]?slice\b/, 'CakeSlice'],
    [/\bcake\b/, 'Cake'],
    [/\bpie\b/, 'Cake'],
    [/\bcroissant\b/, 'Croissant'],
    [/\bbread\b/, 'Croissant'],
    [/\bdonut\b/, 'Donut'],
    [/\bcandy[- ]?cane\b/, 'CandyCane'],
    [/\bcandy\b/, 'Candy'],
    [/\blollipop\b/, 'Lollipop'],
    [/\bchocolate\b/, 'Candy'],
    [/\bcookie\b/, 'Cookie'],
    [/\bpopcorn\b/, 'Popcorn'],
    [/\bpopsicle\b/, 'Popsicle'],
    [/\bdessert\b/, 'Dessert'],
    // Proteins / ingredients
    [/\bshrimp\b/, 'Shrimp'],
    [/\bseafood\b/, 'Fish'],
    [/\bfish\b/, 'Fish'],
    [/\bchicken\b/, 'Drumstick'],
    [/\bpoultry\b/, 'Drumstick'],
    [/\bsteak\b/, 'Beef'],
    [/\bbeef\b/, 'Beef'],
    [/\bpork\b/, 'Beef'],
    [/\bmeat\b/, 'Beef'],
    [/\bgrill\b/, 'CookingPot'],
    [/\bbarbecue\b/, 'CookingPot'],
    [/\bbbq\b/, 'CookingPot'],
    [/\bfried\b/, 'CookingPot'],
    [/\broast\b/, 'CookingPot'],
    [/\begg\b/, 'EggFried'],
    [/\bomelette\b/, 'EggFried'],
    [/\bnut\b/, 'Nut'],
    // Produce
    [/\bgrape\b/, 'Grape'],
    [/\bcherry\b/, 'Cherry'],
    [/\bapple\b/, 'Apple'],
    [/\bbanana\b/, 'Banana'],
    [/\bcitrus\b/, 'Citrus'],
    [/\blemon\b/, 'Citrus'],
    [/\borange\b/, 'Citrus'],
    [/\bcarrot\b/, 'Carrot'],
    [/\bvegetable\b/, 'LeafyGreen'],
    [/\bbroccoli\b/, 'LeafyGreen'],
    [/\bleafy[- ]?green\b/, 'LeafyGreen'],
    [/\bfruit\b/, 'Apple'],
    [/\bvegan\b/, 'Vegan'],
    // Service / course descriptors
    [/\badd[- ]?ons?\b/, 'Cookie'],
    [/\baddon\b/, 'Cookie'],
    [/\bpaper[- ]?bag\b/, 'ShoppingBag'],
    [/\bshopping[- ]?bag\b/, 'ShoppingBag'],
    [/\bbuffet\b/, 'HandPlatter'],
    [/\bstarters?\b/, 'EggFried'],
    [/\bmain\b/, 'Utensils'],
    [/\bcourses?\b/, 'Utensils'],
    [/\bseasonal\b/, 'LeafyGreen'],
    [/\bblender\b/, 'Blend'],
    [/\bmicrowave\b/, 'Microwave'],
    [/\brefrigerator\b/, 'Refrigerator'],
    [/\bcooking[- ]?pot\b/, 'CookingPot'],
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
