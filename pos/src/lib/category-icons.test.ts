import { describe, it, expect } from 'vitest';
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
];

describe('category-icons', () => {
  it('should correctly match category names to icons', () => {
    for (const { input, expected } of cases) {
      const actual = fuzzyMatchIcon(input);
      expect(actual).toBe(expected);
    }
  });
});
