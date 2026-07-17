/**
 * AI Service — OpenAI-compatible chat API integration
 *
 * Architecture:
 * - Provider-agnostic: base_url is configurable (Puter, OpenAI, local LLM, etc.)
 * - Token is NEVER hardcoded — comes from env or Frappe server config
 * - Graceful degradation: if AI is unavailable, POS works normally
 * - Context-aware: receives report data for meaningful insights
 */

// ---- Types ----

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface AIChatResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIServiceConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  requestTimeoutMs: number;
}

// ---- Default Config ----

const DEFAULT_CONFIG: AIServiceConfig = {
  baseUrl: import.meta.env.VITE_AI_BASE_URL || '',
  apiKey: import.meta.env.VITE_AI_API_KEY || '',
  defaultModel: import.meta.env.VITE_AI_MODEL || 'z-ai/glm-5.2',
  defaultTemperature: 0.7,
  defaultMaxTokens: 1024,
  requestTimeoutMs: 30_000,
};

let serviceConfig: AIServiceConfig = { ...DEFAULT_CONFIG };

// ---- Config Management ----

export function getAIConfig(): AIServiceConfig {
  return { ...serviceConfig };
}

export function updateAIConfig(partial: Partial<AIServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...partial };
}

export function isAIEnabled(): boolean {
  return Boolean(serviceConfig.baseUrl && serviceConfig.apiKey);
}

// ---- System Prompts ----

const REPORT_ANALYSIS_SYSTEM_PROMPT = `You are an expert restaurant business analyst AI assistant integrated into a POS (Point of Sale) system. Your role is to analyze sales, expense, and inventory data and provide actionable insights.

Guidelines:
- Respond in the same language the user writes in (Slovenian, English, etc.)
- Be concise but insightful — focus on actionable recommendations
- Use specific numbers from the data when making observations
- Highlight trends, anomalies, and opportunities
- Suggest concrete actions when possible
- Format responses with clear structure (bullet points, bold for key numbers)
- If data seems incomplete, acknowledge limitations
- Never invent data — only analyze what is provided
- For currency amounts, use the currency from the data context`;

// ---- API Call ----

export async function sendAIChatRequest(request: AIChatRequest): Promise<AIChatResponse> {
  const config = getAIConfig();

  if (!config.baseUrl || !config.apiKey) {
    throw new Error('AI service is not configured. Set VITE_AI_BASE_URL and VITE_AI_API_KEY environment variables.');
  }

  const model = request.model || config.defaultModel;
  const temperature = request.temperature ?? config.defaultTemperature;
  const max_tokens = request.max_tokens ?? config.defaultMaxTokens;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature,
        max_tokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`AI API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid AI API response format');
    }

    return {
      content: data.choices[0].message.content,
      model: data.model || model,
      usage: data.usage,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---- Context-Aware Helpers ----

/**
 * Build a system prompt enriched with report data context
 */
export function buildReportContext(
  reportType: string,
  reportData: Record<string, unknown>,
  currency: string = 'EUR'
): string {
  const dataSnippet = JSON.stringify(reportData, null, 2);
  // Limit context size to avoid token overflow
  const truncatedData = dataSnippet.length > 4000
    ? dataSnippet.slice(0, 4000) + '\n... [data truncated]'
    : dataSnippet;

  return `${REPORT_ANALYSIS_SYSTEM_PROMPT}\n\nCurrent report context:\n- Report type: ${reportType}\n- Currency: ${currency}\n- Data:\n${truncatedData}`;
}

/**
 * Ask AI a question about report data
 */
export async function askAboutReport(
  userMessage: string,
  reportType: string,
  reportData: Record<string, unknown>,
  conversationHistory: AIMessage[] = [],
  currency: string = 'EUR'
): Promise<AIChatResponse> {
  const systemMessage: AIMessage = {
    role: 'system',
    content: buildReportContext(reportType, reportData, currency),
  };

  const messages: AIMessage[] = [
    systemMessage,
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  return sendAIChatRequest({ messages });
}

/**
 * Quick insight — one-shot analysis of report data
 */
export async function generateInsight(
  reportType: string,
  reportData: Record<string, unknown>,
  currency: string = 'EUR'
): Promise<AIChatResponse> {
  const systemMessage: AIMessage = {
    role: 'system',
    content: buildReportContext(reportType, reportData, currency),
  };

  const userMessage: AIMessage = {
    role: 'user',
    content: `Provide a brief analysis of this ${reportType} report. Highlight the 3 most important observations and suggest 2 actionable recommendations. Keep it concise.`,
  };

  return sendAIChatRequest({
    messages: [systemMessage, userMessage],
    temperature: 0.5, // More factual for insights
    max_tokens: 800,
  });
}
