import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AiAssistantSettingsPage from './AiAssistantSettingsPage';

vi.mock('@ury/core', () => ({
  call: {
    get: vi.fn((method) => {
      if (method.includes('list_ai_providers')) {
        return Promise.resolve({
          message: {
            providers: [
              { name: 'anthropic', provider_brand: 'Anthropic' },
              { name: 'openai', provider_brand: 'OpenAI' },
            ],
          },
        });
      }
      if (method.includes('get_ai_settings')) {
        return Promise.resolve({ message: { enabled: true } });
      }
      if (method.includes('get_agent_config')) {
        return Promise.resolve({
          message: {
            available: true,
            provider: 'anthropic',
            model: 'model-1',
            temperature: 0.7,
            enable_prompt_caching: false,
          },
        });
      }
      return Promise.resolve({ message: {} });
    }),
    post: vi.fn().mockResolvedValue({ message: { enabled: true } }),
  },
  showToast: { success: vi.fn(), error: vi.fn() },
}));

describe('AiAssistantSettingsPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders AI Assistant Settings page', async () => {
    render(<AiAssistantSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/AI Assistant Settings/i)).toBeInTheDocument();
    });
  });

  it('loads AI settings on mount', async () => {
    const { call } = await import('@ury/core');
    render(<AiAssistantSettingsPage />);
    await waitFor(() => {
      expect(call.get).toHaveBeenCalled();
    });
  });

  it('renders enable toggle and configuration section', async () => {
    render(<AiAssistantSettingsPage />);
    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length > 0).toBe(true);
    });
  });

  it('shows Save Configuration button', async () => {
    render(<AiAssistantSettingsPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const saveBtn = buttons.find((btn) => btn.textContent?.includes('Save'));
      expect(saveBtn).toBeInTheDocument();
    });
  });
});
