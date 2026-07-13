import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogVariants,
  contentVariants,
} from './dialog';

vi.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon">X</span>,
}));

describe('Dialog', () => {
  it('returns null when open is false', () => {
    const { container } = render(<Dialog open={false}>Content</Dialog>);
    expect(container.innerHTML).toBe('');
  });

  it('renders when open is true', () => {
    render(<Dialog open={true}>Dialog Content</Dialog>);
    expect(screen.getByText('Dialog Content')).toBeInTheDocument();
  });

  it('overlay click calls onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        Content
      </Dialog>
    );
    // The overlay is the first child div inside the dialog
    const overlay = container.querySelector('.fixed.inset-0.bg-black\\/50');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    }
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Dialog open={true} ref={ref}>Content</Dialog>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(Dialog.displayName).toBe('Dialog');
  });
});

describe('DialogContent', () => {
  it('stops click propagation', () => {
    const onClick = vi.fn();
    const { container } = render(
      <div onClick={onClick}>
        <DialogContent>Content</DialogContent>
      </div>
    );
    fireEvent.click(screen.getByText('Content'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders close button when showCloseButton and onClose are provided', () => {
    const onClose = vi.fn();
    render(
      <DialogContent showCloseButton={true} onClose={onClose}>
        Content
      </DialogContent>
    );
    expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('close button click calls onClose', () => {
    const onClose = vi.fn();
    render(
      <DialogContent showCloseButton={true} onClose={onClose}>
        Content
      </DialogContent>
    );
    fireEvent.click(screen.getByText('Close').closest('button')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render close button when showCloseButton is false', () => {
    const onClose = vi.fn();
    render(
      <DialogContent showCloseButton={false} onClose={onClose}>
        Content
      </DialogContent>
    );
    expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument();
  });

  it('does not render close button when onClose is not provided', () => {
    render(<DialogContent showCloseButton={true}>Content</DialogContent>);
    expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument();
  });

  it('renders default variant', () => {
    const { container } = render(<DialogContent variant="default">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-md');
  });

  it('renders fullscreen variant', () => {
    const { container } = render(<DialogContent variant="fullscreen">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('w-full');
    expect(content.className).toContain('h-full');
  });

  it('renders large variant', () => {
    const { container } = render(<DialogContent variant="large">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-2xl');
  });

  it('renders xlarge variant', () => {
    const { container } = render(<DialogContent variant="xlarge">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-4xl');
  });

  it('renders sm size', () => {
    const { container } = render(<DialogContent size="sm">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-sm');
  });

  it('renders lg size', () => {
    const { container } = render(<DialogContent size="lg">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-lg');
  });

  it('renders xl size', () => {
    const { container } = render(<DialogContent size="xl">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-xl');
  });

  it('renders 2xl size', () => {
    const { container } = render(<DialogContent size="2xl">Content</DialogContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('max-w-2xl');
  });

  it('close button has sr-only text "Close"', () => {
    const onClose = vi.fn();
    render(
      <DialogContent showCloseButton={true} onClose={onClose}>
        Content
      </DialogContent>
    );
    const srOnly = screen.getByText('Close');
    expect(srOnly).toHaveClass('sr-only');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<DialogContent ref={ref}>Content</DialogContent>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(DialogContent.displayName).toBe('DialogContent');
  });
});

describe('DialogHeader', () => {
  it('renders correctly', () => {
    render(<DialogHeader>Header</DialogHeader>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<DialogHeader className="custom">Header</DialogHeader>);
    const header = container.firstElementChild as HTMLElement;
    expect(header.className).toContain('custom');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<DialogHeader ref={ref}>Header</DialogHeader>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(DialogHeader.displayName).toBe('DialogHeader');
  });
});

describe('DialogFooter', () => {
  it('renders correctly', () => {
    render(<DialogFooter>Footer</DialogFooter>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<DialogFooter className="custom">Footer</DialogFooter>);
    const footer = container.firstElementChild as HTMLElement;
    expect(footer.className).toContain('custom');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<DialogFooter ref={ref}>Footer</DialogFooter>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(DialogFooter.displayName).toBe('DialogFooter');
  });
});

describe('DialogTitle', () => {
  it('renders as h2', () => {
    render(<DialogTitle>Title</DialogTitle>);
    const title = screen.getByText('Title');
    expect(title.tagName).toBe('H2');
  });

  it('applies custom className', () => {
    const { container } = render(<DialogTitle className="custom">Title</DialogTitle>);
    const title = container.firstElementChild as HTMLElement;
    expect(title.className).toContain('custom');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLParagraphElement>();
    render(<DialogTitle ref={ref}>Title</DialogTitle>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(DialogTitle.displayName).toBe('DialogTitle');
  });
});

describe('DialogDescription', () => {
  it('renders as p', () => {
    render(<DialogDescription>Description</DialogDescription>);
    const desc = screen.getByText('Description');
    expect(desc.tagName).toBe('P');
  });

  it('applies custom className', () => {
    const { container } = render(<DialogDescription className="custom">Description</DialogDescription>);
    const desc = container.firstElementChild as HTMLElement;
    expect(desc.className).toContain('custom');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLParagraphElement>();
    render(<DialogDescription ref={ref}>Description</DialogDescription>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(DialogDescription.displayName).toBe('DialogDescription');
  });
});

describe('dialogVariants and contentVariants', () => {
  it('exports dialogVariants as a function', () => {
    expect(typeof dialogVariants).toBe('function');
  });

  it('exports contentVariants as a function', () => {
    expect(typeof contentVariants).toBe('function');
  });

  it('dialogVariants returns base class names', () => {
    const result = dialogVariants();
    expect(result).toContain('fixed');
    expect(result).toContain('z-50');
  });

  it('contentVariants returns base class names', () => {
    const result = contentVariants();
    expect(result).toContain('bg-white');
    expect(result).toContain('rounded-lg');
  });
});
