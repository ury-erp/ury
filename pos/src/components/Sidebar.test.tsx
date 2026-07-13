import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>{children}</span>
  ),
}));

// Module-level mutable store state
let mockPOSStoreState: Record<string, unknown> = {
  selectedCategory: '',
  setSelectedCategory: vi.fn(),
  menuItems: [
    { name: 'Pizza', course: 'Mains', item: 'pizza' },
    { name: 'Salad', course: 'Starters', item: 'salad' },
    { name: 'Pasta', course: 'Mains', item: 'pasta' },
  ],
  categories: [
    { name: 'Mains', label: 'Mains' },
    { name: 'Starters', label: 'Starters' },
  ],
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
}));

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPOSStoreState = {
      selectedCategory: '',
      setSelectedCategory: vi.fn(),
      menuItems: [
        { name: 'Pizza', course: 'Mains', item: 'pizza' },
        { name: 'Salad', course: 'Starters', item: 'salad' },
        { name: 'Pasta', course: 'Mains', item: 'pasta' },
      ],
      categories: [
        { name: 'Mains', label: 'Mains' },
        { name: 'Starters', label: 'Starters' },
      ],
    };
  });

  it('renders the categories section title', () => {
    render(<Sidebar />);
    expect(screen.getByText('pos_sidebar.categories')).toBeInTheDocument();
  });

  it('renders All Items button', () => {
    render(<Sidebar />);
    expect(screen.getByText('pos_sidebar.all_items')).toBeInTheDocument();
  });

  it('shows total menu items count in All Items badge', () => {
    render(<Sidebar />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders each category from the store', () => {
    render(<Sidebar />);
    expect(screen.getByText('Mains')).toBeInTheDocument();
    expect(screen.getByText('Starters')).toBeInTheDocument();
  });

  it('shows category item counts in badges', () => {
    render(<Sidebar />);
    // Mains has 2 items, Starters has 1
    const badges = screen.getAllByText('2');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('calls setSelectedCategory with empty string when All Items is clicked', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText('pos_sidebar.all_items'));
    expect(mockPOSStoreState.setSelectedCategory).toHaveBeenCalledWith('');
  });

  it('calls setSelectedCategory with category name when a category is clicked', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText('Mains'));
    expect(mockPOSStoreState.setSelectedCategory).toHaveBeenCalledWith('Mains');
  });

  it('applies active style to All Items when selectedCategory is empty', () => {
    mockPOSStoreState.selectedCategory = '';
    render(<Sidebar />);
    const allItemsButton = screen.getByText('pos_sidebar.all_items').closest('button')!;
    expect(allItemsButton.className).toContain('shadow-sm');
  });

  it('applies active style to selected category', () => {
    mockPOSStoreState.selectedCategory = 'Mains';
    render(<Sidebar />);
    const mainsButton = screen.getByText('Mains').closest('button')!;
    expect(mainsButton.className).toContain('shadow-sm');
  });

  it('disables all buttons when disabled prop is true', () => {
    render(<Sidebar disabled={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('applies opacity-50 and pointer-events-none when disabled', () => {
    render(<Sidebar disabled={true} />);
    const sidebar = screen.getAllByRole('button')[0].parentElement!.parentElement!.parentElement!;
    expect(sidebar.className).toContain('opacity-50');
    expect(sidebar.className).toContain('pointer-events-none');
  });

  it('renders category counts for items without a course as 0', () => {
    mockPOSStoreState.menuItems = [
      { name: 'Pizza', course: 'Mains', item: 'pizza' },
      { name: 'Special', course: undefined, item: 'special' },
    ];
    mockPOSStoreState.categories = [
      { name: 'Mains', label: 'Mains' },
    ];
    render(<Sidebar />);
    // Mains should have count 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
