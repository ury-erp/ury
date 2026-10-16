import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown } from './chat-markdown';

describe('ChatMarkdown', () => {
  it('renders bold, lists and headings instead of raw markdown', () => {
    const { container } = render(
      <ChatMarkdown>{'## Summary\n\n**Sales** were up.\n\n- Dine-in\n- Takeaway'}</ChatMarkdown>
    );
    expect(screen.getByText('Sales').tagName).toBe('STRONG');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Summary').tagName).toBe('H3');
    expect(container.textContent).not.toContain('**');
  });

  it('renders GFM tables inside a horizontally scrollable wrapper', () => {
    render(<ChatMarkdown>{'| Item | Qty |\n| --- | ---: |\n| Biryani | 12 |'}</ChatMarkdown>);
    const wrapper = screen.getByTestId('chat-md-table');
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.querySelector('table')).not.toBeNull();
    expect(screen.getByText('Biryani').tagName).toBe('TD');
  });

  it('wraps long unbroken tokens and scrolls code blocks', () => {
    const { container } = render(
      <ChatMarkdown>{'POS-INV-2026-000000000000000123456789\n\n```\nselect * from a_very_long_table_name\n```'}</ChatMarkdown>
    );
    expect((container.firstChild as HTMLElement).className).toContain('[overflow-wrap:anywhere]');
    expect(container.querySelector('pre')!.className).toContain('overflow-x-auto');
  });

  it('does not render raw HTML from the model', () => {
    const { container } = render(<ChatMarkdown>{'hi <img src=x onerror="alert(1)"> <b>x</b>'}</ChatMarkdown>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
