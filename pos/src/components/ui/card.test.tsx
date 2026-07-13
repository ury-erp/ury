import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
} from './card';

describe('Card', () => {
  it('renders with default variant and padding', () => {
    const { container } = render(<Card>Card content</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('p-4');
    expect(card.className).toContain('bg-white');
  });

  it('renders elevated variant', () => {
    const { container } = render(<Card variant="elevated">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('shadow-md');
  });

  it('renders outlined variant', () => {
    const { container } = render(<Card variant="outlined">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('border-gray-300');
  });

  it('renders ghost variant', () => {
    const { container } = render(<Card variant="ghost">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('border-transparent');
    expect(card.className).toContain('bg-transparent');
  });

  it('renders none padding', () => {
    const { container } = render(<Card padding="none">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toContain('p-4');
    expect(card.className).not.toContain('p-3');
  });

  it('renders sm padding', () => {
    const { container } = render(<Card padding="sm">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('p-3');
  });

  it('renders default padding', () => {
    const { container } = render(<Card padding="default">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('p-4');
  });

  it('renders lg padding', () => {
    const { container } = render(<Card padding="lg">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('p-6');
  });

  it('renders xl padding', () => {
    const { container } = render(<Card padding="xl">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('p-8');
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Card</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('custom-class');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>Card</Card>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('DIV');
  });
});

describe('CardHeader', () => {
  it('renders correctly', () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<CardHeader className="custom-header">Header</CardHeader>);
    const header = container.firstElementChild as HTMLElement;
    expect(header.className).toContain('custom-header');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardHeader ref={ref}>Header</CardHeader>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(CardHeader.displayName).toBe('CardHeader');
  });
});

describe('CardTitle', () => {
  it('renders as h3', () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText('Title');
    expect(title.tagName).toBe('H3');
  });

  it('applies custom className', () => {
    const { container } = render(<CardTitle className="custom-title">Title</CardTitle>);
    const title = container.firstElementChild as HTMLElement;
    expect(title.className).toContain('custom-title');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLParagraphElement>();
    render(<CardTitle ref={ref}>Title</CardTitle>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(CardTitle.displayName).toBe('CardTitle');
  });
});

describe('CardDescription', () => {
  it('renders as p', () => {
    render(<CardDescription>Description</CardDescription>);
    const desc = screen.getByText('Description');
    expect(desc.tagName).toBe('P');
  });

  it('applies custom className', () => {
    const { container } = render(<CardDescription className="custom-desc">Description</CardDescription>);
    const desc = container.firstElementChild as HTMLElement;
    expect(desc.className).toContain('custom-desc');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLParagraphElement>();
    render(<CardDescription ref={ref}>Description</CardDescription>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(CardDescription.displayName).toBe('CardDescription');
  });
});

describe('CardContent', () => {
  it('renders correctly', () => {
    render(<CardContent>Content</CardContent>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<CardContent className="custom-content">Content</CardContent>);
    const content = container.firstElementChild as HTMLElement;
    expect(content.className).toContain('custom-content');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardContent ref={ref}>Content</CardContent>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(CardContent.displayName).toBe('CardContent');
  });
});

describe('CardFooter', () => {
  it('renders correctly', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<CardFooter className="custom-footer">Footer</CardFooter>);
    const footer = container.firstElementChild as HTMLElement;
    expect(footer.className).toContain('custom-footer');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardFooter ref={ref}>Footer</CardFooter>);
    expect(ref.current).not.toBeNull();
  });

  it('has correct displayName', () => {
    expect(CardFooter.displayName).toBe('CardFooter');
  });
});

describe('cardVariants', () => {
  it('exports cardVariants as a function', () => {
    expect(typeof cardVariants).toBe('function');
  });

  it('cardVariants returns base class names with no arguments', () => {
    const result = cardVariants();
    expect(result).toContain('rounded-lg');
    expect(result).toContain('bg-card');
  });

  it('Card has correct displayName', () => {
    expect(Card.displayName).toBe('Card');
  });
});
