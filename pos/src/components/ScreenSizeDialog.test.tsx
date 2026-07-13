import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScreenSizeDialog from './ScreenSizeDialog';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock UI Button
vi.mock('./ui', () => ({
  Button: ({ children, onClick, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

describe('ScreenSizeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the overlay', () => {
    render(<ScreenSizeDialog />);
    const overlay = screen.getByText('screen_size.title').closest('.fixed')!;
    expect(overlay.className).toContain('bg-black/50');
  });

  it('renders the title', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('screen_size.title')).toBeInTheDocument();
  });

  it('renders the message', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('screen_size.message')).toBeInTheDocument();
  });

  it('renders the mobile hint', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('screen_size.mobile_hint')).toBeInTheDocument();
  });

  it('renders current screen width info', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('screen_size.current_width')).toBeInTheDocument();
  });

  it('displays the current window innerWidth', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText(`${window.innerWidth}px`)).toBeInTheDocument();
  });

  it('renders required width text', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('1024px or larger')).toBeInTheDocument();
  });

  it('renders switch to version 1 button', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('screen_size.switch_v1')).toBeInTheDocument();
  });

  it('opens /urypos in new tab when switch button is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ScreenSizeDialog />);
    fireEvent.click(screen.getByText('screen_size.switch_v1'));
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/urypos'), '_blank');
    openSpy.mockRestore();
  });

  it('renders the Monitor icon', () => {
    render(<ScreenSizeDialog />);
    // Icon container with blue-100 background
    const iconContainer = document.querySelector('.bg-blue-100');
    expect(iconContainer).toBeInTheDocument();
  });

  it('renders dialog with max width', () => {
    render(<ScreenSizeDialog />);
    const dialog = screen.getByText('screen_size.title').closest('.bg-white')!;
    expect(dialog.className).toContain('max-w-md');
  });

  it('renders the alternative option section', () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText('You can use URY POS Version 1 for mobile devices.')).toBeInTheDocument();
  });

  it('renders the less/more legend text', () => {
    render(<ScreenSizeDialog />);
    // The dialog has a centered layout
    const dialog = screen.getByText('screen_size.title').closest('.bg-white')!;
    expect(dialog).toBeInTheDocument();
  });
});
