import { describe, it, expect } from 'vitest';
import { fuzzyMatchIcon } from './category-icons';

describe('fuzzyMatchIcon', () => {
  const cases = [
    // UAT course names
    { input: 'Main Courses', expected: 'Utensils' },
    { input: 'Soups', expected: 'Soup' },
    { input: 'Beverages', expected: 'CupSoda' },
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

  cases.forEach(({ input, expected }) => {
    it(`should map "${input}" to "${expected}"`, () => {
      const actual = fuzzyMatchIcon(input);
      expect(actual).toBe(expected);
    });
  });
});
