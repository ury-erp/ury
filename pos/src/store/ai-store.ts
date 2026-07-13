import { create } from 'zustand';
import {
  askAboutReport,
  generateInsight,
  isAIEnabled,
  type AIMessage,
  type AIChatResponse,
} from '../lib/ai-service';

// ---- Types ----

export interface AIConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AIState {
  enabled: boolean;
  panelOpen: boolean;
  loading: boolean;
  error: string | null;
  messages: AIConversationMessage[];
  currentReportType: string;
  currentReportData: Record<string, unknown>;
  currency: string;
  lastModel: string | null;
  totalTokensUsed: number;
}

export interface AIActions {
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setReportContext: (reportType: string, reportData: Record<string, unknown>, currency?: string) => void;
  sendMessage: (content: string) => Promise<void>;
  generateQuickInsight: () => Promise<void>;
  clearConversation: () => void;
  refreshEnabled: () => void;
}

export type AIStore = AIState & AIActions;

// ---- Helpers ----

let messageCounter = 0;

function createMessage(role: 'user' | 'assistant', content: string): AIConversationMessage {
  messageCounter += 1;
  return {
    id: `ai-msg-${messageCounter}-${Date.now()}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

function buildHistory(messages: AIConversationMessage[]): AIMessage[] {
  // Only send last 10 messages to keep context window manageable
  const recent = messages.slice(-10);
  return recent.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

// ---- Store ----

export const useAIStore = create<AIStore>()((set, get) => ({
  enabled: isAIEnabled(),
  panelOpen: false,
  loading: false,
  error: null,
  messages: [],
  currentReportType: 'sales',
  currentReportData: {},
  currency: 'EUR',
  lastModel: null,
  totalTokensUsed: 0,

  togglePanel: () => {
    const isOpen = get().panelOpen;
    set({ panelOpen: !isOpen });
  },

  openPanel: () => set({ panelOpen: true }),

  closePanel: () => set({ panelOpen: false }),

  setReportContext: (reportType, reportData, currency = 'EUR') => {
    set({
      currentReportType: reportType,
      currentReportData: reportData,
      currency,
    });
  },

  sendMessage: async (content) => {
    const state = get();
    if (state.loading) return;

    const userMsg = createMessage('user', content);
    set({ loading: true, error: null, messages: [...state.messages, userMsg] });

    try {
      const history = buildHistory(state.messages);
      const response = await askAboutReport(
        content,
        state.currentReportType,
        state.currentReportData,
        history,
        state.currency
      );

      const assistantMsg = createMessage('assistant', response.content);
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        lastModel: response.model,
        totalTokensUsed: s.totalTokensUsed + (response.usage?.total_tokens || 0),
        loading: false,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'AI request failed';
      set({ error: errorMsg, loading: false });

      // Add error as assistant message for visibility
      const errorMsg2 = createMessage('assistant', `⚠️ ${errorMsg}`);
      set((s) => ({ messages: [...s.messages, errorMsg2] }));
    }
  },

  generateQuickInsight: async () => {
    const state = get();
    if (state.loading) return;

    set({ loading: true, error: null });

    try {
      const response = await generateInsight(
        state.currentReportType,
        state.currentReportData,
        state.currency
      );

      const insightMsg = createMessage('assistant', response.content);
      set((s) => ({
        messages: [...s.messages, insightMsg],
        lastModel: response.model,
        totalTokensUsed: s.totalTokensUsed + (response.usage?.total_tokens || 0),
        loading: false,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate insight';
      set({ error: errorMsg, loading: false });

      const errorMsg2 = createMessage('assistant', `⚠️ ${errorMsg}`);
      set((s) => ({ messages: [...s.messages, errorMsg2] }));
    }
  },

  clearConversation: () => {
    set({ messages: [], error: null });
  },

  refreshEnabled: () => {
    set({ enabled: isAIEnabled() });
  },
}));
