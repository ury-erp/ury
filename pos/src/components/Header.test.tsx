import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Header from './Header';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock react-router-dom
const mockLocation = { pathname: '/' };
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useLocation: () => mockLocation,
}));

// Mock auth-api
vi.mock('../lib/auth-api', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));

// Mock toast
vi.mock('./ui/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, placeholder, ...props }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
}));

// Module-level mutable store state
let mockRootStoreState: Record<string, unknown> = {
  user: { name: 'test@user.com', full_name: 'Test User', roles: [] },
  orderSearchQuery: '',
  setOrderSearchQuery: vi.fn(),
};

let mockPOSStoreState: Record<string, unknown> = {
  searchQuery: '',
  setSearchQuery: vi.fn(),
};

vi.mock('../store/root-store', () => ({
  useRootStore: (selector: any) => {
    const state = mockRootStoreState;
    return selector ? selector(state) : state;
  },
}));

vi.mock('../store/pos-store', () => ({
  usePOSStore: (selector: any) => {
    const state = mockPOSStoreState;
    return selector ? selector(state) : state;
  },
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRootStoreState = {
      user: { name: 'test@user.com', full_name: 'Test User', roles: [] },
      orderSearchQuery: '',
      setOrderSearchQuery: vi.fn(),
    };
    mockPOSStoreState = {
      searchQuery: '',
      setSearchQuery: vi.fn(),
    };
    mockLocation.pathname = '/';
  });

  it('renders the logo image', () => {
    render(<Header />);
    const logo = screen.getByAltText('URY POS');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/assets/ury/pos/ury_pos.png');
  });

  it('displays user full name', () => {
    render(<Header />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('displays default user text when user has no full_name', () => {
    mockRootStoreState.user = { name: 'test@user.com', full_name: undefined, roles: [] };
    render(<Header />);
    expect(screen.getByText('header.default_user')).toBeInTheDocument();
  });

  it('shows user menu dropdown when user button is clicked', () => {
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    // The dropdown should show user info
    expect(screen.getByText('test@user.com')).toBeInTheDocument();
  });

  it('toggles user menu on click', () => {
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    // Click to open
    fireEvent.click(userButton);
    expect(screen.getByText('test@user.com')).toBeInTheDocument();
    // Click to close
    fireEvent.click(userButton);
    expect(screen.queryByText('test@user.com')).not.toBeInTheDocument();
  });

  it('closes user menu on outside click', () => {
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    expect(screen.getByText('test@user.com')).toBeInTheDocument();
    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('test@user.com')).not.toBeInTheDocument();
  });

  it('renders logout button in dropdown', () => {
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    expect(screen.getByText('header.logout')).toBeInTheDocument();
  });

  it('calls logout and redirects on logout click', async () => {
    const { logout } = await import('../lib/auth-api');
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    const logoutBtn = screen.getByText('header.logout').closest('button')!;
    await act(async () => {
      fireEvent.click(logoutBtn);
    });
    expect(logout).toHaveBeenCalled();
  });

  it('shows error toast on logout failure', async () => {
    const { logout } = await import('../lib/auth-api');
    (logout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Logout failed'));
    const { showToast } = await import('./ui/toast');
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    const logoutBtn = screen.getByText('header.logout').closest('button')!;
    await act(async () => {
      fireEvent.click(logoutBtn);
    });
    expect(showToast.error).toHaveBeenCalledWith('errors.failed_logout');
  });

  it('renders switch to desk button in dropdown', () => {
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    expect(screen.getByText('header.switch_to_desk')).toBeInTheDocument();
  });

  it('renders clear cache button in dropdown', () => {
    render(<Header />);
    const userButton = screen.getByText('Test User').closest('button')!;
    fireEvent.click(userButton);
    expect(screen.getByText('header.clear_cache')).toBeInTheDocument();
  });

  it('renders search input on home page', () => {
    mockLocation.pathname = '/';
    render(<Header />);
    const searchInput = screen.getByPlaceholderText('header.search_placeholder_menu');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders search input on orders page', () => {
    mockLocation.pathname = '/orders';
    render(<Header />);
    const searchInput = screen.getByPlaceholderText('header.search_placeholder_orders');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders search input with default placeholder on other pages', () => {
    mockLocation.pathname = '/dashboard';
    render(<Header />);
    const searchInput = screen.getByPlaceholderText('header.search_placeholder_default');
    expect(searchInput).toBeInTheDocument();
  });

  it('focuses search input on Ctrl+K', () => {
    render(<Header />);
    const searchInput = screen.getByPlaceholderText('header.search_placeholder_menu');
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(searchInput).toHaveFocus();
  });

  it('focuses search input on Cmd+K', () => {
    render(<Header />);
    const searchInput = screen.getByPlaceholderText('header.search_placeholder_menu');
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(searchInput).toHaveFocus();
  });
});
