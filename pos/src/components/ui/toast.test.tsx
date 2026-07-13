import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { showToast, ToastProvider } from './toast';

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  ToastContainer: () => <div data-testid="toast-container" />,
}));

vi.mock('lucide-react', () => ({
  CheckCircle: () => <span data-testid="check-circle-icon">✓</span>,
  XCircle: () => <span data-testid="x-circle-icon">✗</span>,
  Info: () => <span data-testid="info-icon">ℹ</span>,
}));

// Mock CSS imports
vi.mock('react-toastify/dist/ReactToastify.css', () => ({}));
vi.mock('./toast.css', () => ({}));

describe('showToast', () => {
  it('has success method', () => {
    expect(typeof showToast.success).toBe('function');
  });

  it('has error method', () => {
    expect(typeof showToast.error).toBe('function');
  });

  it('has info method', () => {
    expect(typeof showToast.info).toBe('function');
  });

  it('showToast.success calls toast.success', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('Success message');
    expect(toast.success).toHaveBeenCalledWith('Success message', expect.objectContaining({
      position: 'top-right',
      autoClose: 2000,
      theme: 'colored',
      className: 'toast-success',
    }));
  });

  it('showToast.error calls toast.error', async () => {
    const { toast } = await import('react-toastify');
    showToast.error('Error message');
    expect(toast.error).toHaveBeenCalledWith('Error message', expect.objectContaining({
      position: 'top-right',
      autoClose: 2000,
      theme: 'colored',
      className: 'toast-error',
    }));
  });

  it('showToast.info calls toast.info', async () => {
    const { toast } = await import('react-toastify');
    showToast.info('Info message');
    expect(toast.info).toHaveBeenCalledWith('Info message', expect.objectContaining({
      position: 'top-right',
      autoClose: 2000,
      theme: 'colored',
      className: 'toast-info',
    }));
  });

  it('showToast.success passes correct position', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('test');
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ position: 'top-right' })
    );
  });

  it('showToast.success passes correct autoClose', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('test');
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ autoClose: 2000 })
    );
  });

  it('showToast.success passes correct theme', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('test');
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ theme: 'colored' })
    );
  });

  it('showToast.success passes hideProgressBar: false', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('test');
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ hideProgressBar: false })
    );
  });

  it('showToast.success passes closeOnClick: true', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('test');
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ closeOnClick: true })
    );
  });

  it('showToast.success passes draggable: true', async () => {
    const { toast } = await import('react-toastify');
    showToast.success('test');
    expect(toast.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ draggable: true })
    );
  });

  it('showToast.error passes icon', async () => {
    const { toast } = await import('react-toastify');
    showToast.error('test');
    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ icon: expect.anything() })
    );
  });

  it('showToast.info passes icon', async () => {
    const { toast } = await import('react-toastify');
    showToast.info('test');
    expect(toast.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ icon: expect.anything() })
    );
  });
});

describe('ToastProvider', () => {
  it('renders ToastContainer', () => {
    render(<ToastProvider />);
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });
});
