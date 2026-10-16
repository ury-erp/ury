import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call } from '@ury/core';
import { PrinterStatusButton, PrinterWatchProvider } from './PrinterWatch';

vi.mock('@ury/core', () => ({
  call: { get: vi.fn() },
}));

describe('PrinterStatusButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when printer watch is not installed', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not installed'));

    const { container } = render(
      <PrinterWatchProvider>
        <PrinterStatusButton />
      </PrinterWatchProvider>
    );

    await waitFor(() => expect(call.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the button when printer watch is installed', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: { installed: true },
    });

    render(
      <PrinterWatchProvider>
        <PrinterStatusButton />
      </PrinterWatchProvider>
    );

    expect(await screen.findByText('Printer Status')).toBeInTheDocument();
  });
});
