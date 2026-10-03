import { describe, expect, it } from 'vitest';
import { fuzzyMatchIcon } from './category-icons';

interface Case {
  input: string;
  expected: string;
}

const cases: Case[] = [
  // UAT course names
  { input: 'Main Courses', expected: 'Utensils' },
  { input: 'Soups', expected: 'Soup' },
  { input: 'Beverages', expected: 'Coffee' },
  { input: 'Starters', expected: 'EggFried' },
  { input: 'Desserts', expected: 'Dessert' },
  { input: 'Buffets', expected: 'HandPlatter' },
  { input: 'Seasonal', expected: 'LeafyGreen' },
  { input: 'Add-ons', expected: 'Cookie' },
  { input: 'Salads', expected: 'Salad' },
  { input: 'Pizza', expected: 'Pizza' },
  // Compound / fuzzy examples
  { input: 'Chicken Pizza', expected: 'Pizza' },
  { input: 'Smash Burger', expected: 'Hamburger' },
  { input: 'Grilled Fish', expected: 'Fish' },
  { input: 'Ice-Cream', expected: 'IceCreamCone' },
  { input: 'Soft Drinks', expected: 'CupSoda' },
  // Iraqi Arabic category names
  { input: 'مشويات', expected: 'Beef' },
  { input: 'كص دجاج', expected: 'Sandwich' },
  { input: 'دجاج', expected: 'Drumstick' },
  { input: 'سمك مسكوف', expected: 'Fish' },
  { input: 'تمن ومرق', expected: 'CookingPot' },
  { input: 'شوربات', expected: 'Soup' },
  { input: 'مشروبات ساخنة', expected: 'Coffee' },
  { input: 'مشروبات باردة', expected: 'CupSoda' },
  { input: 'عصائر', expected: 'Citrus' },
  { input: 'برگر', expected: 'Hamburger' },
  { input: 'حلويات', expected: 'Cake' },
];

describe('fuzzyMatchIcon', () => {
  it.each(cases)('$input => $expected', ({ input, expected }) => {
    expect(fuzzyMatchIcon(input)).toBe(expected);
  });
});
