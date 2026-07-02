import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommentDialog from './CommentDialog';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  MessageSquare: () => <span data-testid="message-square-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

// Mock UI components
vi.mock('./ui', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, placeholder, disabled, type, ...props }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} type={type} {...props} />
  ),
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: any) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  Select: ({ children, value, onValueChange, placeholder, disabled }: any) => (
    <select value={value} onChange={(e: any) => onValueChange?.(e.target.value)} disabled={disabled} data-testid="select">
      {children}
    </select>
  ),
  SelectItem: ({ children, value, className }: any) => (
    <option value={value} className={className}>{children}</option>
  ),
  Badge: ({ children, variant }: any) => <span data-testid="badge">{children}</span>,
  Textarea: ({ value, onChange, placeholder, className, ...props }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} className={className} {...props} />
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Loader: () => <div data-testid="loader">Loading...</div>,
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  initialComment: '',
};

describe('CommentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Rendering
  it('should render when isOpen is true', () => {
    render(<CommentDialog {...defaultProps} />);
    expect(screen.getByText('comment.title')).toBeInTheDocument();
  });

  it('should not render when isOpen is false', () => {
    render(<CommentDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('comment.title')).not.toBeInTheDocument();
  });

  it('should display the title with MessageSquare icon', () => {
    render(<CommentDialog {...defaultProps} />);
    expect(screen.getByTestId('message-square-icon')).toBeInTheDocument();
    expect(screen.getByText('comment.title')).toBeInTheDocument();
  });

  // Textarea
  it('should render a textarea for comments', () => {
    render(<CommentDialog {...defaultProps} />);
    expect(screen.getByDisplayValue('')).toBeInTheDocument();
  });

  it('should show the comment label', () => {
    render(<CommentDialog {...defaultProps} />);
    expect(screen.getByText('comment.label')).toBeInTheDocument();
  });

  it('should show placeholder text in textarea', () => {
    render(<CommentDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText('comment.placeholder')).toBeInTheDocument();
  });

  // Initial comment
  it('should display initialComment value in textarea', () => {
    render(<CommentDialog {...defaultProps} initialComment="No onions" />);
    expect(screen.getByDisplayValue('No onions')).toBeInTheDocument();
  });

  // Typing in textarea
  it('should update textarea value when user types', () => {
    render(<CommentDialog {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('comment.placeholder');
    fireEvent.change(textarea, { target: { value: 'Extra spicy' } });
    expect(textarea).toHaveValue('Extra spicy');
  });

  // Save button
  it('should call onSave with comment and onClose when Save is clicked', () => {
    render(<CommentDialog {...defaultProps} initialComment="Well done" />);
    fireEvent.click(screen.getByText('comment.save_button'));
    expect(defaultProps.onSave).toHaveBeenCalledWith('Well done');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // Cancel button
  it('should call onClose when Cancel button is clicked', () => {
    render(<CommentDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // X close button
  it('should call onClose when X button is clicked', () => {
    render(<CommentDialog {...defaultProps} />);
    const xIcon = screen.getByTestId('x-icon');
    const closeButton = xIcon.closest('button');
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // Comment sync on dialog open
  it('should sync comment state with initialComment when dialog opens', () => {
    const { rerender } = render(<CommentDialog {...defaultProps} isOpen={false} initialComment="Test" />);
    rerender(<CommentDialog {...defaultProps} isOpen={true} initialComment="Test" />);
    expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
  });

  // Save empty comment
  it('should call onSave with empty string when saving with no comment', () => {
    render(<CommentDialog {...defaultProps} initialComment="" />);
    fireEvent.click(screen.getByText('comment.save_button'));
    expect(defaultProps.onSave).toHaveBeenCalledWith('');
  });
});
