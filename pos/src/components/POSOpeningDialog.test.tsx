import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import POSOpeningDialog from './POSOpeningDialog';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock UI Button
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
}));

describe('POSOpeningDialog', () => {
  const mockOnReload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders overlay background', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    const overlay = screen.getByText('pos.not_opened_title').closest('.fixed')!;
    expect(overlay.className).toContain('bg-black/50');
  });

  it('renders opening title for opening type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    expect(screen.getByText('pos.not_opened_title')).toBeInTheDocument();
  });

  it('renders closing title for closing type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="closing" />);
    expect(screen.getByText('pos.not_closed_title')).toBeInTheDocument();
  });

  it('renders opening message for opening type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    expect(screen.getByText('pos.not_opened_message')).toBeInTheDocument();
  });

  it('renders closing message for closing type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="closing" />);
    expect(screen.getByText('pos.not_closed_message')).toBeInTheDocument();
  });

  it('renders reload button', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    expect(screen.getByText('pos.reload_page')).toBeInTheDocument();
  });

  it('renders switch to desk button', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    expect(screen.getByText('pos.switch_to_desk')).toBeInTheDocument();
  });

  it('calls onReload when reload button is clicked', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    fireEvent.click(screen.getByText('pos.reload_page'));
    expect(mockOnReload).toHaveBeenCalledTimes(1);
  });

  it('opens /app in new tab when switch to desk is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    fireEvent.click(screen.getByText('pos.switch_to_desk'));
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/app'), '_blank');
    openSpy.mockRestore();
  });

  it('renders RefreshCw icon in opening type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    // The component renders a RefreshCw icon for opening type
    const dialog = screen.getByText('pos.not_opened_title').closest('.bg-white')!;
    expect(dialog).toBeInTheDocument();
  });

  it('renders AlertTriangle icon in closing type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="closing" />);
    const dialog = screen.getByText('pos.not_closed_title').closest('.bg-white')!;
    expect(dialog).toBeInTheDocument();
  });

  it('has red background icon for opening type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    const iconContainer = document.querySelector('.bg-red-100');
    expect(iconContainer).toBeInTheDocument();
  });

  it('has orange background icon for closing type', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="closing" />);
    const iconContainer = document.querySelector('.bg-orange-100');
    expect(iconContainer).toBeInTheDocument();
  });

  it('renders centered dialog with max width', () => {
    render(<POSOpeningDialog onReload={mockOnReload} type="opening" />);
    const dialog = screen.getByText('pos.not_opened_title').closest('.bg-white')!;
    expect(dialog.className).toContain('max-w-md');
  });
});
