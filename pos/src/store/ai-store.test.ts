import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock functions are available when vi.mock factory runs
const { mockAskAboutReport, mockGenerateInsight, mockIsAIEnabled } = vi.hoisted(() => ({
  mockAskAboutReport: vi.fn(),
  mockGenerateInsight: vi.fn(),
  mockIsAIEnabled: vi.fn(),
}));

vi.mock('../lib/ai-service', () => ({
  askAboutReport: (...args: unknown[]) => mockAskAboutReport(...args),
  generateInsight: (...args: unknown[]) => mockGenerateInsight(...args),
  isAIEnabled: () => mockIsAIEnabled(),
}));

// Import after mock setup
import { useAIStore } from './ai-store';

// ---- Helpers ----

function getStore() {
  return useAIStore.getState();
}

function resetStore() {
  useAIStore.setState({
    enabled: false,
    panelOpen: false,
    loading: false,
    error: null,
    messages: [],
    currentReportType: 'sales',
    currentReportData: {},
    currency: 'EUR',
    lastModel: null,
    totalTokensUsed: 0,
  });
}

const SUCCESS_RESPONSE = {
  content: 'AI analysis result',
  model: 'z-ai/glm-5.2',
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

// ---- Tests ----

describe('ai-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAIEnabled.mockReturnValue(false);
    resetStore();
  });

  // ========== Initial State ==========

  describe('initial state', () => {
    it('should have enabled=false when isAIEnabled returns false', () => {
      mockIsAIEnabled.mockReturnValue(false);
      // Re-import not feasible, so test via setState pattern
      // Instead, test that refreshEnabled sets it correctly
      useAIStore.getState().refreshEnabled();
      expect(getStore().enabled).toBe(false);
    });

    it('should have panelOpen=false by default', () => {
      expect(getStore().panelOpen).toBe(false);
    });

    it('should have loading=false by default', () => {
      expect(getStore().loading).toBe(false);
    });

    it('should have null error by default', () => {
      expect(getStore().error).toBeNull();
    });

    it('should have empty messages array by default', () => {
      expect(getStore().messages).toEqual([]);
    });

    it('should have currentReportType=sales by default', () => {
      expect(getStore().currentReportType).toBe('sales');
    });

    it('should have currentReportData={} by default', () => {
      expect(getStore().currentReportData).toEqual({});
    });

    it('should have currency=EUR by default', () => {
      expect(getStore().currency).toBe('EUR');
    });

    it('should have lastModel=null by default', () => {
      expect(getStore().lastModel).toBeNull();
    });

    it('should have totalTokensUsed=0 by default', () => {
      expect(getStore().totalTokensUsed).toBe(0);
    });
  });

  // ========== togglePanel ==========

  describe('togglePanel', () => {
    it('should toggle panelOpen from false to true', () => {
      expect(getStore().panelOpen).toBe(false);
      getStore().togglePanel();
      expect(getStore().panelOpen).toBe(true);
    });

    it('should toggle panelOpen from true to false', () => {
      useAIStore.setState({ panelOpen: true });
      getStore().togglePanel();
      expect(getStore().panelOpen).toBe(false);
    });
  });

  // ========== openPanel / closePanel ==========

  describe('openPanel', () => {
    it('should set panelOpen to true', () => {
      useAIStore.setState({ panelOpen: false });
      getStore().openPanel();
      expect(getStore().panelOpen).toBe(true);
    });
  });

  describe('closePanel', () => {
    it('should set panelOpen to false', () => {
      useAIStore.setState({ panelOpen: true });
      getStore().closePanel();
      expect(getStore().panelOpen).toBe(false);
    });
  });

  // ========== setReportContext ==========

  describe('setReportContext', () => {
    it('should set reportType, reportData, and currency', () => {
      const data = { total: 5000 };
      getStore().setReportContext('expenses', data, 'USD');
      const state = getStore();
      expect(state.currentReportType).toBe('expenses');
      expect(state.currentReportData).toEqual(data);
      expect(state.currency).toBe('USD');
    });

    it('should default currency to EUR when not provided', () => {
      getStore().setReportContext('inventory', { items: 10 });
      expect(getStore().currency).toBe('EUR');
    });
  });

  // ========== sendMessage ==========

  describe('sendMessage', () => {
    it('should add user message to messages', async () => {
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().sendMessage('What are the top sellers?');

      const msgs = getStore().messages;
      expect(msgs.length).toBeGreaterThanOrEqual(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[0].content).toBe('What are the top sellers?');
    });

    it('should add assistant message on success', async () => {
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().sendMessage('Hello');

      const msgs = getStore().messages;
      const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
      expect(assistantMsgs).toHaveLength(1);
      expect(assistantMsgs[0].content).toBe('AI analysis result');
    });

    it('should call askAboutReport with correct arguments', async () => {
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);
      useAIStore.setState({ currentReportType: 'expenses', currentReportData: { total: 3000 }, currency: 'USD' });

      await getStore().sendMessage('Analyze this');

      expect(mockAskAboutReport).toHaveBeenCalledWith(
        'Analyze this',
        'expenses',
        { total: 3000 },
        expect.any(Array), // history
        'USD'
      );
    });

    it('should set loading to false after success', async () => {
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().sendMessage('Hello');

      expect(getStore().loading).toBe(false);
    });

    it('should update lastModel on success', async () => {
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().sendMessage('Hello');

      expect(getStore().lastModel).toBe('z-ai/glm-5.2');
    });

    it('should accumulate totalTokensUsed on success', async () => {
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().sendMessage('Hello');

      expect(getStore().totalTokensUsed).toBe(30);
    });

    it('should handle error and add error assistant message', async () => {
      mockAskAboutReport.mockRejectedValue(new Error('Service unavailable'));

      await getStore().sendMessage('Hello');

      const state = getStore();
      expect(state.error).toBe('Service unavailable');
      expect(state.loading).toBe(false);

      const errorMsg = state.messages.find((m) => m.content.includes('⚠️'));
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.content).toContain('Service unavailable');
    });

    it('should handle non-Error thrown objects', async () => {
      mockAskAboutReport.mockRejectedValue('string error');

      await getStore().sendMessage('Hello');

      expect(getStore().error).toBe('AI request failed');
    });

    it('should not send when already loading', async () => {
      useAIStore.setState({ loading: true });
      mockAskAboutReport.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().sendMessage('Hello');

      expect(mockAskAboutReport).not.toHaveBeenCalled();
    });
  });

  // ========== generateQuickInsight ==========

  describe('generateQuickInsight', () => {
    it('should call generateInsight with current context', async () => {
      mockGenerateInsight.mockResolvedValue(SUCCESS_RESPONSE);
      useAIStore.setState({ currentReportType: 'sales', currentReportData: { revenue: 1000 }, currency: 'EUR' });

      await getStore().generateQuickInsight();

      expect(mockGenerateInsight).toHaveBeenCalledWith('sales', { revenue: 1000 }, 'EUR');
    });

    it('should add assistant message on success', async () => {
      mockGenerateInsight.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().generateQuickInsight();

      const msgs = getStore().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('assistant');
      expect(msgs[0].content).toBe('AI analysis result');
    });

    it('should update lastModel on success', async () => {
      mockGenerateInsight.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().generateQuickInsight();

      expect(getStore().lastModel).toBe('z-ai/glm-5.2');
    });

    it('should accumulate totalTokensUsed on success', async () => {
      mockGenerateInsight.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().generateQuickInsight();

      expect(getStore().totalTokensUsed).toBe(30);
    });

    it('should set loading to false after success', async () => {
      mockGenerateInsight.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().generateQuickInsight();

      expect(getStore().loading).toBe(false);
    });

    it('should handle error and add error assistant message', async () => {
      mockGenerateInsight.mockRejectedValue(new Error('Insight failed'));

      await getStore().generateQuickInsight();

      const state = getStore();
      expect(state.error).toBe('Insight failed');
      expect(state.loading).toBe(false);
      const errorMsg = state.messages.find((m) => m.content.includes('⚠️'));
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.content).toContain('Insight failed');
    });

    it('should not generate when already loading', async () => {
      useAIStore.setState({ loading: true });
      mockGenerateInsight.mockResolvedValue(SUCCESS_RESPONSE);

      await getStore().generateQuickInsight();

      expect(mockGenerateInsight).not.toHaveBeenCalled();
    });

    it('should handle non-Error thrown objects in generateQuickInsight', async () => {
      mockGenerateInsight.mockRejectedValue(42);

      await getStore().generateQuickInsight();

      expect(getStore().error).toBe('Failed to generate insight');
    });
  });

  // ========== clearConversation ==========

  describe('clearConversation', () => {
    it('should clear messages and error', () => {
      useAIStore.setState({
        messages: [
          { id: '1', role: 'user' as const, content: 'Hi', timestamp: Date.now() },
          { id: '2', role: 'assistant' as const, content: 'Hello', timestamp: Date.now() },
        ],
        error: 'Some error',
      });

      getStore().clearConversation();

      expect(getStore().messages).toEqual([]);
      expect(getStore().error).toBeNull();
    });
  });

  // ========== refreshEnabled ==========

  describe('refreshEnabled', () => {
    it('should set enabled=true when isAIEnabled returns true', () => {
      mockIsAIEnabled.mockReturnValue(true);
      getStore().refreshEnabled();
      expect(getStore().enabled).toBe(true);
    });

    it('should set enabled=false when isAIEnabled returns false', () => {
      mockIsAIEnabled.mockReturnValue(false);
      getStore().refreshEnabled();
      expect(getStore().enabled).toBe(false);
    });
  });

  // ========== Token Tracking ==========

  describe('token tracking', () => {
    it('should accumulate tokens across multiple sendMessage calls', async () => {
      mockAskAboutReport.mockResolvedValue({
        content: 'First',
        model: 'model-a',
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });

      await getStore().sendMessage('First question');

      mockAskAboutReport.mockResolvedValue({
        content: 'Second',
        model: 'model-b',
        usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
      });

      await getStore().sendMessage('Second question');

      expect(getStore().totalTokensUsed).toBe(35); // 15 + 20
    });

    it('should default to 0 tokens when usage is missing', async () => {
      mockAskAboutReport.mockResolvedValue({
        content: 'No usage',
        model: 'model-a',
        // no usage field
      });

      await getStore().sendMessage('Question');

      expect(getStore().totalTokensUsed).toBe(0);
    });
  });
});
