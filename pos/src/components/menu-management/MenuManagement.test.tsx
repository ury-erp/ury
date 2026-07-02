import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MenuManagement from './MenuManagement';

// ---- Mocks ----

const mockFetchMenus = vi.fn().mockResolvedValue(undefined);
const mockFetchCourses = vi.fn().mockResolvedValue(undefined);
const mockFetchAvailableItems = vi.fn().mockResolvedValue(undefined);
const mockFetchMenuDetail = vi.fn().mockResolvedValue(undefined);
const mockToggleMenuStatus = vi.fn().mockResolvedValue(undefined);
const mockSetSearchQuery = vi.fn();
const mockSetSelectedCourseFilter = vi.fn();
const mockClearSelectedMenu = vi.fn();
const mockUpdateItemInMenu = vi.fn().mockResolvedValue(undefined);
const mockRemoveItemFromMenu = vi.fn().mockResolvedValue(undefined);

const defaultStoreState = {
  menus: [],
  selectedMenu: null,
  courses: [],
  availableItems: [],
  loading: false,
  menuDetailLoading: false,
  coursesLoading: false,
  itemsLoading: false,
  error: null,
  searchQuery: '',
  selectedCourseFilter: '',
  fetchMenus: mockFetchMenus,
  fetchMenuDetail: mockFetchMenuDetail,
  fetchCourses: mockFetchCourses,
  fetchAvailableItems: mockFetchAvailableItems,
  toggleMenuStatus: mockToggleMenuStatus,
  setSearchQuery: mockSetSearchQuery,
  setSelectedCourseFilter: mockSetSelectedCourseFilter,
  clearSelectedMenu: mockClearSelectedMenu,
  updateItemInMenu: mockUpdateItemInMenu,
  removeItemFromMenu: mockRemoveItemFromMenu,
};

const mockUseMenuManagementStore = vi.fn();

vi.mock('../../store/menu-management-store', () => ({
  useMenuManagementStore: (...args: any[]) => mockUseMenuManagementStore(...args),
  // Also need to mock getState for handleMenuSelect
}));

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

vi.mock('../../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../lib/menu-management-api', () => ({
  URYMenuItem: {},
}));

vi.mock('./MenuItemsList', () => ({
  default: ({ items, menuName, onEditItem }: any) => (
    <div data-testid="menu-items-list">
      {items.map((item: any) => (
        <div key={item.name} data-testid={`menu-item-${item.name}`}>
          {item.item_name}
        </div>
      ))}
    </div>
  ),
  SortConfig: null,
}));

vi.mock('./CourseManager', () => ({
  default: () => <div data-testid="course-manager">CourseManager</div>,
}));

vi.mock('./AddItemDialog', () => ({
  default: ({ menuName, onClose }: any) => (
    <div data-testid="add-item-dialog">
      <span>{menuName}</span>
      <button onClick={onClose}>Close Add</button>
    </div>
  ),
}));

vi.mock('./EditItemDialog', () => ({
  default: ({ item, menuName, onClose }: any) => (
    <div data-testid="edit-item-dialog">
      <span>{item?.item_name}</span>
      <button onClick={onClose}>Close Edit</button>
    </div>
  ),
}));

vi.mock('./BulkActionsToolbar', () => ({
  default: ({ selectedCount, onClearSelection }: any) => (
    <div data-testid="bulk-actions-toolbar">
      <span>Selected: {selectedCount}</span>
      <button onClick={onClearSelection}>Clear Selection</button>
    </div>
  ),
}));

vi.mock('./BatchPriceUpdateDialog', () => ({
  default: ({ menuName, onClose }: any) => (
    <div data-testid="batch-price-dialog">
      <span>{menuName}</span>
      <button onClick={onClose}>Close Batch</button>
    </div>
  ),
}));

vi.mock('../ui', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Badge: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Spinner: () => <div data-testid="spinner" />,
}));

const sampleMenus = [
  {
    name: 'Lunch Menu',
    enabled: 1,
    branch: 'Main',
    price_list: 'Standard',
    items: [],
    item_count: 10,
    enabled_count: 8,
  },
  {
    name: 'Dinner Menu',
    enabled: 0,
    branch: 'Main',
    price_list: 'Premium',
    items: [],
    item_count: 5,
    enabled_count: 0,
  },
];

const sampleSelectedMenu = {
  name: 'Lunch Menu',
  enabled: 1,
  branch: 'Main',
  price_list: 'Standard',
  items: [
    { name: 'item-1', item: 'Burger', item_name: 'Burger', rate: 10, special_dish: 0, disabled: 0, course: 'Main', course_icon: null, idx: 1 },
    { name: 'item-2', item: 'Pizza', item_name: 'Pizza', rate: 15, special_dish: 1, disabled: 0, course: 'Main', course_icon: null, idx: 2 },
    { name: 'item-3', item: 'Salad', item_name: 'Caesar Salad', rate: 8, special_dish: 0, disabled: 1, course: 'Starter', course_icon: null, idx: 3 },
  ],
  item_count: 3,
  enabled_count: 2,
};

const sampleCourses = [
  { name: 'course-1', course: 'Main', custom_serving_priority: 1, custom_indicate_in_kds: 0 },
  { name: 'course-2', course: 'Starter', custom_serving_priority: 2, custom_indicate_in_kds: 0 },
];

describe('MenuManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMenuManagementStore.mockReturnValue(defaultStoreState);
    // Mock getState for handleMenuSelect
    defaultStoreState.fetchMenuDetail = mockFetchMenuDetail;
  });

  // ---- Menu List View (no selectedMenu) ----

  it('renders the menu management title', () => {
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.title')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.subtitle')).toBeInTheDocument();
  });

  it('renders Manage Courses button', () => {
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.manage_courses')).toBeInTheDocument();
  });

  it('renders menu tabs (items and courses)', () => {
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.menus_tab')).toBeInTheDocument();
    expect(screen.getByText('menu_management.courses_tab')).toBeInTheDocument();
  });

  it('shows no menus message when menus array is empty and not loading', () => {
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.no_menus')).toBeInTheDocument();
  });

  it('shows spinner when loading', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      loading: true,
    });
    render(<MenuManagement />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders menu cards when menus exist', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      menus: sampleMenus,
    });
    render(<MenuManagement />);
    expect(screen.getByText('Lunch Menu')).toBeInTheDocument();
    expect(screen.getByText('Dinner Menu')).toBeInTheDocument();
  });

  it('shows Active badge for enabled menu', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      menus: sampleMenus,
    });
    render(<MenuManagement />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Disabled badge for disabled menu', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      menus: sampleMenus,
    });
    render(<MenuManagement />);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows item count and active count for each menu', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      menus: sampleMenus,
    });
    render(<MenuManagement />);
    expect(screen.getByText('10 items')).toBeInTheDocument();
    expect(screen.getByText('8 active')).toBeInTheDocument();
  });

  it('calls fetchMenus, fetchCourses, fetchAvailableItems on mount', () => {
    render(<MenuManagement />);
    expect(mockFetchMenus).toHaveBeenCalledTimes(1);
    expect(mockFetchCourses).toHaveBeenCalledTimes(1);
    expect(mockFetchAvailableItems).toHaveBeenCalledTimes(1);
  });

  it('switches to courses tab when courses tab is clicked', () => {
    render(<MenuManagement />);
    fireEvent.click(screen.getByText('menu_management.courses_tab'));
    expect(screen.getByTestId('course-manager')).toBeInTheDocument();
  });

  // ---- Menu Detail View (with selectedMenu) ----

  it('renders menu detail view when a menu is selected', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    expect(screen.getByText('Lunch Menu')).toBeInTheDocument();
    expect(screen.getByText(/items \| Branch:/)).toBeInTheDocument();
  });

  it('renders back button and Add Item button in detail view', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.add_item')).toBeInTheDocument();
    expect(screen.getByText('menu_management.batch_update_prices')).toBeInTheDocument();
  });

  it('renders search input and course filter in detail view', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    expect(screen.getByPlaceholderText('menu_management.search_items')).toBeInTheDocument();
    expect(screen.getByText('menu_management.all_courses')).toBeInTheDocument();
  });

  it('renders menu items list in detail view', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    expect(screen.getByTestId('menu-items-list')).toBeInTheDocument();
  });

  it('renders bulk actions toolbar in detail view', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    expect(screen.getByTestId('bulk-actions-toolbar')).toBeInTheDocument();
  });

  it('calls clearSelectedMenu when back button is clicked', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    // The back button is a Button with variant="ghost" containing ArrowLeft icon
    // Find it by the button that triggers clearSelectedMenu
    const backButton = screen.getByRole('button', { name: '' }); // ghost buttons may not have accessible names
    // The first ghost button in detail view should be the back button
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(mockClearSelectedMenu).toHaveBeenCalled();
  });

  it('opens Add Item Dialog when Add Item button is clicked', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    fireEvent.click(screen.getByText('menu_management.add_item'));
    expect(screen.getByTestId('add-item-dialog')).toBeInTheDocument();
  });

  it('closes Add Item Dialog when close button is clicked', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    fireEvent.click(screen.getByText('menu_management.add_item'));
    expect(screen.getByTestId('add-item-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Add'));
    expect(screen.queryByTestId('add-item-dialog')).not.toBeInTheDocument();
  });

  it('opens Batch Price Update Dialog when batch button is clicked', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    fireEvent.click(screen.getByText('menu_management.batch_update_prices'));
    expect(screen.getByTestId('batch-price-dialog')).toBeInTheDocument();
  });

  it('closes Batch Price Update Dialog when close button is clicked', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: sampleSelectedMenu,
      courses: sampleCourses,
    });
    render(<MenuManagement />);
    fireEvent.click(screen.getByText('menu_management.batch_update_prices'));
    expect(screen.getByTestId('batch-price-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Batch'));
    expect(screen.queryByTestId('batch-price-dialog')).not.toBeInTheDocument();
  });

  it('shows empty state when filtered items is empty with search query', () => {
    mockUseMenuManagementStore.mockReturnValue({
      ...defaultStoreState,
      selectedMenu: {
        ...sampleSelectedMenu,
        items: [],
      },
      courses: sampleCourses,
      searchQuery: 'nonexistent',
    });
    render(<MenuManagement />);
    expect(screen.getByText('menu_management.no_search_results')).toBeInTheDocument();
  });
});
