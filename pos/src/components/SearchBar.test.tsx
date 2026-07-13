import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from './SearchBar';

// Mock the i18n module
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Search: () => <svg data-testid="search-icon" />,
  X: () => <svg data-testid="x-icon" />,
}));

const defaultProps = {
  value: '',
  onChange: vi.fn(),
  onVisibilityChange: vi.fn(),
  isVisible: false,
};

// Helper: find the toggle button (contains search icon, not X icon)
const getToggleButton = () => screen.getAllByRole('button').find(b => b.querySelector('[data-testid="search-icon"]'));

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Rendering tests
  it('should render the search toggle button when not visible', () => {
    render(<SearchBar {...defaultProps} />);
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });

  it('should have the input in DOM but invisible when isVisible is false', () => {
    render(<SearchBar {...defaultProps} isVisible={false} />);
    // The input is still in the DOM but the container has 'invisible' class
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    expect(input).toBeInTheDocument();
    // The parent should have the invisible class
    const invisibleWrapper = input.closest('.invisible');
    expect(invisibleWrapper).toBeInTheDocument();
  });

  it('should render the input as visible when isVisible is true', () => {
    render(<SearchBar {...defaultProps} isVisible={true} />);
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    expect(input).toBeInTheDocument();
    const invisibleWrapper = input.closest('.invisible');
    expect(invisibleWrapper).not.toBeInTheDocument();
  });

  // Toggle visibility
  it('should call onVisibilityChange(true) when toggle button is clicked', () => {
    render(<SearchBar {...defaultProps} isVisible={false} />);
    const toggleButton = getToggleButton();
    fireEvent.click(toggleButton!);
    expect(defaultProps.onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('should hide the toggle button when isVisible is true', () => {
    render(<SearchBar {...defaultProps} isVisible={true} />);
    // The toggle button has the 'hidden' class when visible
    const toggleButton = getToggleButton();
    expect(toggleButton?.className).toContain('hidden');
  });

  // Input interaction
  it('should display the value prop in the input', () => {
    render(<SearchBar {...defaultProps} value="pizza" isVisible={true} />);
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    expect(input).toHaveValue('pizza');
  });

  it('should call onChange when input value changes', () => {
    render(<SearchBar {...defaultProps} isVisible={true} />);
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    fireEvent.change(input, { target: { value: 'burger' } });
    expect(defaultProps.onChange).toHaveBeenCalledWith('burger');
  });

  it('should use t() for placeholder text', () => {
    render(<SearchBar {...defaultProps} isVisible={true} />);
    expect(screen.getByPlaceholderText('common.search_placeholder_menu')).toBeInTheDocument();
  });

  // Clear button (X)
  it('should call onVisibilityChange(false) and onChange("") when X button is clicked', () => {
    render(<SearchBar {...defaultProps} isVisible={true} value="test" />);
    const xButton = screen.getAllByRole('button').find(b => b.querySelector('[data-testid="x-icon"]'));
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(defaultProps.onVisibilityChange).toHaveBeenCalledWith(false);
    expect(defaultProps.onChange).toHaveBeenCalledWith('');
  });

  it('should render the X icon button when visible', () => {
    render(<SearchBar {...defaultProps} isVisible={true} />);
    expect(screen.getByTestId('x-icon')).toBeInTheDocument();
  });

  // Disabled state
  it('should disable the toggle button when disabled prop is true', () => {
    render(<SearchBar {...defaultProps} isVisible={false} disabled={true} />);
    const toggleButton = getToggleButton();
    expect(toggleButton).toBeDisabled();
  });

  it('should disable the input when disabled prop is true', () => {
    render(<SearchBar {...defaultProps} isVisible={true} disabled={true} />);
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    expect(input).toBeDisabled();
  });

  it('should disable the X button when disabled prop is true', () => {
    render(<SearchBar {...defaultProps} isVisible={true} disabled={true} />);
    const xButton = screen.getAllByRole('button').find(b => b.querySelector('[data-testid="x-icon"]'));
    expect(xButton).toBeDisabled();
  });

  it('should apply opacity-50 and cursor-not-allowed classes to toggle button when disabled', () => {
    render(<SearchBar {...defaultProps} isVisible={false} disabled={true} />);
    const toggleButton = getToggleButton();
    expect(toggleButton?.className).toContain('opacity-50');
    expect(toggleButton?.className).toContain('cursor-not-allowed');
  });

  it('should apply bg-gray-50 and cursor-not-allowed to input when disabled', () => {
    render(<SearchBar {...defaultProps} isVisible={true} disabled={true} />);
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    expect(input.className).toContain('bg-gray-50');
    expect(input.className).toContain('cursor-not-allowed');
  });

  // Focus behavior
  it('should focus the input when isVisible becomes true', () => {
    const { rerender } = render(<SearchBar {...defaultProps} isVisible={false} />);
    rerender(<SearchBar {...defaultProps} isVisible={true} />);
    const input = screen.getByPlaceholderText('common.search_placeholder_menu');
    expect(input).toHaveFocus();
  });

  // Transition classes
  it('should apply w-56 class on the transition container when isVisible is true', () => {
    render(<SearchBar {...defaultProps} isVisible={true} />);
    const container = document.querySelector('.w-56');
    expect(container).toBeInTheDocument();
    expect(container?.className).toContain('transition-all');
  });

  it('should apply w-0 class when isVisible is false', () => {
    render(<SearchBar {...defaultProps} isVisible={false} />);
    const container = document.querySelector('.w-0');
    expect(container).toBeInTheDocument();
  });

  it('should apply opacity-100 when visible and opacity-0 when hidden', () => {
    const { rerender } = render(<SearchBar {...defaultProps} isVisible={true} />);
    const visibleContainer = document.querySelector('.opacity-100');
    expect(visibleContainer).toBeInTheDocument();

    rerender(<SearchBar {...defaultProps} isVisible={false} />);
    const hiddenContainer = document.querySelector('.opacity-0');
    expect(hiddenContainer).toBeInTheDocument();
  });
});
