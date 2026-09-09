import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HufLogo } from './HufLogo';

describe('HufLogo', () => {
  it('renders an SVG element', () => {
    const { container } = render(<HufLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('has the correct viewBox', () => {
    const { container } = render(<HufLogo />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('726.888 420 466.222 240');
  });

  it('has aria-label HUF', () => {
    const { container } = render(<HufLogo />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('HUF');
  });

  it('has role img', () => {
    const { container } = render(<HufLogo />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('applies custom className', () => {
    const { container } = render(<HufLogo className="text-blue-500" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('text-blue-500')).toBe(true);
  });

  it('renders with default className including h-3.5 and w-auto', () => {
    const { container } = render(<HufLogo />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('h-3.5')).toBe(true);
    expect(svg?.classList.contains('w-auto')).toBe(true);
  });

  it('contains a path element with the logo design', () => {
    const { container } = render(<HufLogo />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('fill')).toBe('url(#huf-logo-gradient)');
  });

  it('contains a linearGradient definition', () => {
    const { container } = render(<HufLogo />);
    const gradient = container.querySelector('#huf-logo-gradient');
    expect(gradient).toBeTruthy();
  });
});
