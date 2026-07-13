import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuList from './MenuList';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock storage for formatCurrency
vi.mock('../lib/storage', () => ({
  storage: {
    getItem: (key: string) => key === 'currencySymbol' ? '€' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Mock MenuCard
vi.mock('./MenuCard', () => ({
  __esModule: true,
  default: ({ name, price, course, onClick, disabled }: any) => (
    <div data-testid={`menu-card-${name}`} onClick={onClick} data-disabled={disabled}>
      <span>{name}</span>
      <span>{price}</span>
      <span>{course}</span>
    </div>
  ),
}));

// Mock Spinner
vi.mock('./ui/spinner', () => ({
  Spinner: ({ message }: any) => <div data-testid="spinner">{message || 'Loading...'}</div>,
}));

// Module-level mutable store state
let mockPOSStoreState: Record<string, unknown> = {
  menuItems: [
    { id: '1', name: 'Pizza', item: 'pizza', price: 12, course: 'Mains', course_label: 'Mains', image: null, special_dish: 0 },
    { id: '2', name: 'Salad', item: 'salad', price: 8, course: 'Starters', course_label: 'Starters', image: null, special_dish: 0 },
    { id: '3', name: 'Pasta', item: 'pasta', price: 15, course: 'Mains', course_label: 'Mains', image: null, special_dish: 1 },
  ],
  menuLoading: false,
  error: null,
  selectedCategory: '',
  searchQuery: '',
  quickFilter: 'all',
  fetchMenuItems: vi.fn(),
  isMenuInteractionDisabled: () => false,
  isOrderInteractionDisabled: () => false,
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
}));

describe('MenuList', () => {
  const mockOnItemClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPOSStoreState = {
      menuItems: [
        { id: '1', name: 'Pizza', item: 'pizza', price: 12, course: 'Mains', course_label: 'Mains', image: null, special_dish: 0 },
        { id: '2', name: 'Salad', item: 'salad', price: 8, course: 'Starters', course_label: 'Starters', image: null, special_dish: 0 },
        { id: '3', name: 'Pasta', item: 'pasta', price: 15, course: 'Mains', course_label: 'Mains', image: null, special_dish: 1 },
      ],
      menuLoading: false,
      error: null,
      selectedCategory: '',
      searchQuery: '',
      quickFilter: 'all',
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: () => false,
      isOrderInteractionDisabled: () => false,
    };
  });

  it('calls fetchMenuItems on mount', () => {
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(mockPOSStoreState.fetchMenuItems).toHaveBeenCalledTimes(1);
  });

  it('shows spinner when menuLoading is true', () => {
    mockPOSStoreState.menuLoading = true;
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows loading message when menuLoading is true', () => {
    mockPOSStoreState.menuLoading = true;
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByText('common.loading_menu_items')).toBeInTheDocument();
  });

  it('shows error message when error exists', () => {
    mockPOSStoreState.error = 'Something went wrong';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByText('common.error_loading_menu_items')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows no items message when filtered items are empty', () => {
    mockPOSStoreState.menuItems = [];
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByText('common.no_items_found')).toBeInTheDocument();
  });

  it('shows try adjusting filters message when no items match', () => {
    mockPOSStoreState.menuItems = [];
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByText('common.try_adjusting_filters')).toBeInTheDocument();
  });

  it('renders menu items as MenuCard components', () => {
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pizza')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-Salad')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-Pasta')).toBeInTheDocument();
  });

  it('filters items by selectedCategory', () => {
    mockPOSStoreState.selectedCategory = 'Mains';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pizza')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-Pasta')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Salad')).not.toBeInTheDocument();
  });

  it('filters items by searchQuery matching name', () => {
    mockPOSStoreState.searchQuery = 'piz';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pizza')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Salad')).not.toBeInTheDocument();
  });

  it('filters items by searchQuery matching item code', () => {
    mockPOSStoreState.searchQuery = 'sal';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Salad')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Pizza')).not.toBeInTheDocument();
  });

  it('filters items by quickFilter special', () => {
    mockPOSStoreState.quickFilter = 'special';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pasta')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Pizza')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Salad')).not.toBeInTheDocument();
  });

  it('shows all items when quickFilter is all', () => {
    mockPOSStoreState.quickFilter = 'all';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pizza')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-Salad')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-Pasta')).toBeInTheDocument();
  });

  it('calls onItemClick when a menu card is clicked', () => {
    render(<MenuList onItemClick={mockOnItemClick} />);
    fireEvent.click(screen.getByTestId('menu-card-Pizza'));
    expect(mockOnItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pizza' })
    );
  });

  it('applies opacity and pointer-events-none when menu interaction is disabled', () => {
    mockPOSStoreState.isMenuInteractionDisabled = () => true;
    render(<MenuList onItemClick={mockOnItemClick} />);
    const grid = document.querySelector('.opacity-50.pointer-events-none');
    expect(grid).toBeInTheDocument();
  });

  it('applies opacity and pointer-events-none when order interaction is disabled', () => {
    mockPOSStoreState.isOrderInteractionDisabled = () => true;
    render(<MenuList onItemClick={mockOnItemClick} />);
    const grid = document.querySelector('.opacity-50.pointer-events-none');
    expect(grid).toBeInTheDocument();
  });

  it('does not apply disabled styles when interactions are enabled', () => {
    render(<MenuList onItemClick={mockOnItemClick} />);
    const grid = document.querySelector('.opacity-50.pointer-events-none');
    expect(grid).not.toBeInTheDocument();
  });

  it('shows no items message when search query filters out all items', () => {
    mockPOSStoreState.searchQuery = 'xyz';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByText('common.no_items_found')).toBeInTheDocument();
  });

  it('shows no items message when category filters out all items', () => {
    mockPOSStoreState.selectedCategory = 'Desserts';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByText('common.no_items_found')).toBeInTheDocument();
  });

  it('search is case insensitive', () => {
    mockPOSStoreState.searchQuery = 'PIZ';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pizza')).toBeInTheDocument();
  });

  it('combines category and search filters', () => {
    mockPOSStoreState.selectedCategory = 'Mains';
    mockPOSStoreState.searchQuery = 'piz';
    render(<MenuList onItemClick={mockOnItemClick} />);
    expect(screen.getByTestId('menu-card-Pizza')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Pasta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-card-Salad')).not.toBeInTheDocument();
  });

  it('renders menu card with disabled prop when interaction is disabled', () => {
    mockPOSStoreState.isMenuInteractionDisabled = () => true;
    render(<MenuList onItemClick={mockOnItemClick} />);
    const card = screen.getByTestId('menu-card-Pizza');
    expect(card).toHaveAttribute('data-disabled', 'true');
  });
});
