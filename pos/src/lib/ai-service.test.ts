import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAIConfig,
  updateAIConfig,
  isAIEnabled,
  sendAIChatRequest,
  buildReportContext,
  askAboutReport,
  generateInsight,
  type AIServiceConfig,
} from './ai-service';

// ---- Helpers ----

const VALID_CONFIG: Partial<AIServiceConfig> = {
  baseUrl: 'https://ai.example.com/v1',
  apiKey: 'test-api-key-123',
};

function configureAI(overrides?: Partial<AIServiceConfig>) {
  updateAIConfig({ ...VALID_CONFIG, ...overrides });
}

function resetConfig() {
  updateAIConfig({
    baseUrl: '',
    apiKey: '',
    defaultModel: 'z-ai/glm-5.2',
    defaultTemperature: 0.7,
    defaultMaxTokens: 1024,
    requestTimeoutMs: 30_000,
  });
}

function mockFetchSuccess(responseData: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseData),
    text: () => Promise.resolve(''),
  });
}

const VALID_API_RESPONSE = {
  choices: [{ message: { content: 'Hello from AI!' } }],
  model: 'z-ai/glm-5.2',
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

// ---- Tests ----

describe('ai-service', () => {
  beforeEach(() => {
    resetConfig();
    vi.restoreAllMocks();
  });

  // ========== getAIConfig ==========

  describe('getAIConfig', () => {
    it('should return default config values', () => {
      const config = getAIConfig();
      expect(config.defaultModel).toBe('z-ai/glm-5.2');
      expect(config.defaultTemperature).toBe(0.7);
      expect(config.defaultMaxTokens).toBe(1024);
      expect(config.requestTimeoutMs).toBe(30_000);
    });

    it('should return a copy — mutations do not affect internal state', () => {
      const config = getAIConfig();
      config.baseUrl = 'mutated';
      expect(getAIConfig().baseUrl).toBe('');
    });
  });

  // ========== updateAIConfig ==========

  describe('updateAIConfig', () => {
    it('should merge partial config into existing config', () => {
      updateAIConfig({ baseUrl: 'https://new.url' });
      expect(getAIConfig().baseUrl).toBe('https://new.url');
      // Other fields unchanged
      expect(getAIConfig().defaultModel).toBe('z-ai/glm-5.2');
    });

    it('should overwrite multiple fields at once', () => {
      updateAIConfig({ baseUrl: 'https://a.com', apiKey: 'key-abc', defaultModel: 'custom-model' });
      const config = getAIConfig();
      expect(config.baseUrl).toBe('https://a.com');
      expect(config.apiKey).toBe('key-abc');
      expect(config.defaultModel).toBe('custom-model');
    });
  });

  // ========== isAIEnabled ==========

  describe('isAIEnabled', () => {
    it('should return false when baseUrl is empty', () => {
      updateAIConfig({ baseUrl: '', apiKey: 'some-key' });
      expect(isAIEnabled()).toBe(false);
    });

    it('should return false when apiKey is empty', () => {
      updateAIConfig({ baseUrl: 'https://ai.example.com', apiKey: '' });
      expect(isAIEnabled()).toBe(false);
    });

    it('should return false when both are empty', () => {
      updateAIConfig({ baseUrl: '', apiKey: '' });
      expect(isAIEnabled()).toBe(false);
    });

    it('should return true when both baseUrl and apiKey are set', () => {
      configureAI();
      expect(isAIEnabled()).toBe(true);
    });
  });

  // ========== sendAIChatRequest ==========

  describe('sendAIChatRequest', () => {
    it('should throw when AI is not configured', async () => {
      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('AI service is not configured');
    });

    it('should send a successful chat request and return parsed response', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await sendAIChatRequest({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello from AI!');
      expect(result.model).toBe('z-ai/glm-5.2');
      expect(result.usage?.total_tokens).toBe(30);
    });

    it('should use default model, temperature, and max_tokens when not specified', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await sendAIChatRequest({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('z-ai/glm-5.2');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(1024);
    });

    it('should use custom model, temperature, and max_tokens when provided', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await sendAIChatRequest({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        temperature: 0.3,
        max_tokens: 500,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4');
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(500);
    });

    it('should send Authorization header with Bearer token', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] });

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer test-api-key-123');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should POST to {baseUrl}/chat/completions', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(fetchSpy.mock.calls[0][0]).toBe('https://ai.example.com/v1/chat/completions');
      expect(fetchSpy.mock.calls[0][1].method).toBe('POST');
    });

    it('should throw on non-ok response with status and body', async () => {
      configureAI();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limited'),
        })
      );

      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow('AI API error (429): Rate limited');
    });

    it('should handle text() rejection in error path gracefully', async () => {
      configureAI();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.reject(new Error('read error')),
        })
      );

      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow('AI API error (500): Unknown error');
    });

    it('should throw on invalid API response format (missing choices)', async () => {
      configureAI();
      vi.stubGlobal(
        'fetch',
        mockFetchSuccess({ model: 'test' }) // no choices
      );

      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow('Invalid AI API response format');
    });

    it('should throw on invalid API response format (missing content)', async () => {
      configureAI();
      vi.stubGlobal(
        'fetch',
        mockFetchSuccess({ choices: [{ message: {} }] })
      );

      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow('Invalid AI API response format');
    });

    it('should throw timeout error when request is aborted', async () => {
      configureAI({ requestTimeoutMs: 5 });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, options: RequestInit) => {
          // Simulate abort by calling the abort signal handler
          const signal = options.signal as AbortSignal;
          if (signal) {
            // Dispatch abort event
            const error = new DOMException('The operation was aborted', 'AbortError');
            return Promise.reject(error);
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        })
      );

      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow('AI request timed out');
    });

    it('should fall back to request model when API response model is absent', async () => {
      configureAI();
      vi.stubGlobal(
        'fetch',
        mockFetchSuccess({
          choices: [{ message: { content: 'Hi back' } }],
          // no model field
        })
      );

      const result = await sendAIChatRequest({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'my-model',
      });
      expect(result.model).toBe('my-model');
    });

    it('should re-throw non-abort errors unchanged', async () => {
      configureAI();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network failure'))
      );

      await expect(
        sendAIChatRequest({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow('Network failure');
    });
  });

  // ========== buildReportContext ==========

  describe('buildReportContext', () => {
    it('should include the report type in the output', () => {
      const ctx = buildReportContext('sales', {});
      expect(ctx).toContain('Report type: sales');
    });

    it('should include the currency in the output', () => {
      const ctx = buildReportContext('sales', {}, 'USD');
      expect(ctx).toContain('Currency: USD');
    });

    it('should default currency to EUR when not provided', () => {
      const ctx = buildReportContext('sales', {});
      expect(ctx).toContain('Currency: EUR');
    });

    it('should include JSON-serialized report data', () => {
      const data = { total: 1000, items: 42 };
      const ctx = buildReportContext('sales', data);
      expect(ctx).toContain('"total": 1000');
      expect(ctx).toContain('"items": 42');
    });

    it('should truncate data exceeding 4000 characters', () => {
      const largeData = { payload: 'X'.repeat(5000) };
      const ctx = buildReportContext('sales', largeData);
      expect(ctx).toContain('... [data truncated]');
    });

    it('should not truncate small data', () => {
      const smallData = { total: 100 };
      const ctx = buildReportContext('sales', smallData);
      expect(ctx).not.toContain('[data truncated]');
    });
  });

  // ========== askAboutReport ==========

  describe('askAboutReport', () => {
    it('should build correct message structure: system + history + user', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await askAboutReport(
        'What are the top sellers?',
        'sales',
        { total: 5000 },
        [{ role: 'user', content: 'Previous question' }, { role: 'assistant', content: 'Previous answer' }],
        'EUR'
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(4); // system + 2 history + 1 user
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('Report type: sales');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe('Previous question');
      expect(body.messages[2].role).toBe('assistant');
      expect(body.messages[2].content).toBe('Previous answer');
      expect(body.messages[3].role).toBe('user');
      expect(body.messages[3].content).toBe('What are the top sellers?');
    });

    it('should work with empty conversation history', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await askAboutReport('Hello', 'sales', {});

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2); // system + user only
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });
  });

  // ========== generateInsight ==========

  describe('generateInsight', () => {
    it('should use lower temperature (0.5) for factual insights', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await generateInsight('expenses', { total: 3000 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.5);
    });

    it('should use max_tokens of 800', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await generateInsight('expenses', { total: 3000 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(800);
    });

    it('should include the report type in the user prompt', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await generateInsight('inventory', {});

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const userMsg = body.messages[1];
      expect(userMsg.content).toContain('inventory');
    });

    it('should send exactly 2 messages: system + user', async () => {
      configureAI();
      const fetchSpy = mockFetchSuccess(VALID_API_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      await generateInsight('sales', {});

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });
  });
});
