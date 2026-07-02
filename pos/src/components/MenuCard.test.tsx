import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuCard from './MenuCard';

// Mock the i18n module
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock the storage module for formatCurrency
vi.mock('../lib/storage', () => ({
  storage: {
    getItem: (key: string) => key === 'currencySymbol' ? '€' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Mock utils to use our mocked storage
vi.mock('../lib/utils', async () => {
  const actual = await vi.importActual('../lib/utils');
  return {
    ...actual,
  };
});

const defaultProps = {
  name: 'Margherita Pizza',
  price: 12.5,
  item_image: null,
  course: 'Mains',
  item: 'margherita-pizza',
  onClick: vi.fn(),
};

describe('MenuCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Role and aria-label
  it('should have role="button"', () => {
    render(<MenuCard {...defaultProps} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should have aria-label including name, price, and course', () => {
    render(<MenuCard {...defaultProps} />);
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('aria-label', 'Margherita Pizza, € 12.5, Mains');
  });

  it('should have aria-label without course when course is not provided', () => {
    render(<MenuCard {...defaultProps} course={undefined} />);
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('aria-label', 'Margherita Pizza, € 12.5');
  });

  it('should use formatCurrency for price display', () => {
    render(<MenuCard {...defaultProps} />);
    expect(screen.getByText('€ 12.5')).toBeInTheDocument();
  });

  // Image display
  it('should show image when item_image is provided', () => {
    render(<MenuCard {...defaultProps} item_image="https://example.com/pizza.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/pizza.jpg');
    expect(img).toHaveAttribute('alt', 'Margherita Pizza');
  });

  it('should show placeholder with name initials when item_image is null', () => {
    render(<MenuCard {...defaultProps} item_image={null} />);
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('should show placeholder with name initials when item_image is empty string', () => {
    render(<MenuCard {...defaultProps} item_image="" />);
    // Empty string is falsy, so fallback should show
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('should show uppercase initials from first two characters of name', () => {
    render(<MenuCard {...defaultProps} name="burger" item_image={null} />);
    expect(screen.getByText('BU')).toBeInTheDocument();
  });

  it('should handle single-character name for placeholder', () => {
    render(<MenuCard {...defaultProps} name="A" item_image={null} />);
    // name.slice(0,2).toUpperCase() => 'A'.slice(0,2) = 'A', toUpperCase = 'A'
    // Both the placeholder div and the h3 contain 'A', so use getAllByText
    const elements = screen.getAllByText('A');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  // Image error fallback
  it('should fall back to placeholder when image fails to load', () => {
    render(<MenuCard {...defaultProps} item_image="https://example.com/broken.jpg" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    // After error, placeholder should appear
    expect(screen.getByText('MA')).toBeInTheDocument();
    // Image should no longer be in the document
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  // Name display
  it('should display the item name', () => {
    render(<MenuCard {...defaultProps} />);
    expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
  });

  it('should have title attribute on the name element', () => {
    render(<MenuCard {...defaultProps} />);
    const nameElement = screen.getByTitle('Margherita Pizza');
    expect(nameElement).toBeInTheDocument();
  });

  // Course display
  it('should display course text when provided', () => {
    render(<MenuCard {...defaultProps} course="Starters" />);
    expect(screen.getByText('Starters')).toBeInTheDocument();
  });

  it('should render the course paragraph even when course is not provided', () => {
    render(<MenuCard {...defaultProps} course={undefined} />);
    // When course is absent, the paragraph still renders with ' ' content (no title attr)
    const paragraphs = document.querySelectorAll('p.text-xs.text-gray-500.truncate');
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it('should have title attribute on course element', () => {
    render(<MenuCard {...defaultProps} course="Mains" />);
    const courseElement = screen.getByTitle('Mains');
    expect(courseElement).toBeInTheDocument();
  });

  // Click handling
  it('should call onClick when clicked', () => {
    render(<MenuCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
  });

  // Keyboard handling
  it('should call onClick when Enter key is pressed', () => {
    render(<MenuCard {...defaultProps} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
  });

  it('should call onClick when Space key is pressed', () => {
    render(<MenuCard {...defaultProps} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });
    expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick for other keys', () => {
    render(<MenuCard {...defaultProps} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Tab' });
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  // Disabled state
  it('should have tabIndex=-1 when disabled', () => {
    render(<MenuCard {...defaultProps} disabled={true} />);
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabIndex', '-1');
  });

  it('should have tabIndex=0 when not disabled', () => {
    render(<MenuCard {...defaultProps} disabled={false} />);
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabIndex', '0');
  });

  it('should not call onClick when disabled and clicked', () => {
    render(<MenuCard {...defaultProps} disabled={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('should not call onClick when disabled and Enter is pressed', () => {
    render(<MenuCard {...defaultProps} disabled={true} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('should not call onClick when disabled and Space is pressed', () => {
    render(<MenuCard {...defaultProps} disabled={true} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });
    expect(defaultProps.onClick).not.toHaveBeenCalled();
  });

  it('should apply opacity-50 class when disabled', () => {
    render(<MenuCard {...defaultProps} disabled={true} />);
    const card = screen.getByRole('button');
    expect(card.className).toContain('opacity-50');
  });

  it('should apply cursor-not-allowed class when disabled', () => {
    render(<MenuCard {...defaultProps} disabled={true} />);
    const card = screen.getByRole('button');
    expect(card.className).toContain('cursor-not-allowed');
  });

  // Price display
  it('should display formatted price', () => {
    render(<MenuCard {...defaultProps} price={9.99} />);
    expect(screen.getByText('€ 9.99')).toBeInTheDocument();
  });

  it('should display price of 0 correctly', () => {
    render(<MenuCard {...defaultProps} price={0} />);
    expect(screen.getByText('€ 0')).toBeInTheDocument();
  });

  // Combined rendering
  it('should render image and content sections together', () => {
    render(<MenuCard {...defaultProps} item_image="https://example.com/food.jpg" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
    expect(screen.getByText('€ 12.5')).toBeInTheDocument();
  });
});
