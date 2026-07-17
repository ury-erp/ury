import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AIInsightsPanel from './AIInsightsPanel';
import { useAIStore } from '../../store/ai-store';

// jsdom does not implement scrollIntoView — stub it out
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ── Mock store actions ──────────────────────────────────────────────
const mockTogglePanel = vi.fn();
const mockSendMessage = vi.fn();
const mockGenerateQuickInsight = vi.fn();
const mockClearConversation = vi.fn();

// ── Mutable store state so tests can change it before rendering ─────
let mockStoreState: ReturnType<typeof useAIStore>;

vi.mock('../../store/ai-store', () => ({
  useAIStore: () => mockStoreState,
}));

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// ── Helpers ─────────────────────────────────────────────────────────
function defaultStoreState(overrides: Partial<ReturnType<typeof useAIStore>> = {}) {
  return {
    panelOpen: false,
    loading: false,
    error: null,
    messages: [],
    togglePanel: mockTogglePanel,
    sendMessage: mockSendMessage,
    generateQuickInsight: mockGenerateQuickInsight,
    clearConversation: mockClearConversation,
    enabled: true,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    setReportContext: vi.fn(),
    refreshEnabled: vi.fn(),
    currentReportType: 'sales',
    currentReportData: {},
    currency: 'EUR',
    lastModel: null,
    totalTokensUsed: 0,
    ...overrides,
  } as ReturnType<typeof useAIStore>;
}

// ── Tests ───────────────────────────────────────────────────────────
describe('AIInsightsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = defaultStoreState();
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. Closed state
  // ─────────────────────────────────────────────────────────────────
  describe('closed state', () => {
    it('renders the floating button when panel is closed', () => {
      mockStoreState = defaultStoreState({ panelOpen: false });
      render(<AIInsightsPanel />);
      // The button has a title attribute
      expect(screen.getByTitle('ai.open_panel')).toBeInTheDocument();
    });

    it('shows the AI Insights label on the floating button', () => {
      mockStoreState = defaultStoreState({ panelOpen: false });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.insights')).toBeInTheDocument();
    });

    it('calls togglePanel when the floating button is clicked', () => {
      mockStoreState = defaultStoreState({ panelOpen: false });
      render(<AIInsightsPanel />);
      fireEvent.click(screen.getByTitle('ai.open_panel'));
      expect(mockTogglePanel).toHaveBeenCalledTimes(1);
    });

    it('does not render the panel container when closed', () => {
      mockStoreState = defaultStoreState({ panelOpen: false });
      render(<AIInsightsPanel />);
      // The panel has a w-96 class; ensure it is absent
      expect(document.querySelector('.w-96')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Open state
  // ─────────────────────────────────────────────────────────────────
  describe('open state', () => {
    it('renders the panel header with title', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.title')).toBeInTheDocument();
    });

    it('renders the close button', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      expect(screen.getByTitle('ai.close')).toBeInTheDocument();
    });

    it('renders the input placeholder text', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      expect(screen.getByPlaceholderText('ai.input_placeholder')).toBeInTheDocument();
    });

    it('renders the disclaimer text', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.disclaimer')).toBeInTheDocument();
    });

    it('does not render the floating open button when open', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      expect(screen.queryByTitle('ai.open_panel')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. Quick actions
  // ─────────────────────────────────────────────────────────────────
  describe('quick actions', () => {
    it('shows quick actions when there are no messages', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [] });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.quick_actions')).toBeInTheDocument();
    });

    it('hides quick actions when there are messages', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      expect(screen.queryByText('ai.quick_actions')).not.toBeInTheDocument();
    });

    it('"Analyze Report" button calls generateQuickInsight', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [] });
      render(<AIInsightsPanel />);
      fireEvent.click(screen.getByText('ai.analyze_report'));
      expect(mockGenerateQuickInsight).toHaveBeenCalledTimes(1);
    });

    it('"Top Items" button calls sendMessage with the top items question', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [] });
      render(<AIInsightsPanel />);
      fireEvent.click(screen.getByText('ai.top_selling'));
      expect(mockSendMessage).toHaveBeenCalledWith('ai.default_question_top_items');
    });

    it('"Trends" button calls sendMessage with the trends question', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [] });
      render(<AIInsightsPanel />);
      fireEvent.click(screen.getByText('ai.trends'));
      expect(mockSendMessage).toHaveBeenCalledWith('ai.default_question_trends');
    });

    it('quick action buttons are disabled when loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [], loading: true });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.analyze_report').closest('button')).toBeDisabled();
      expect(screen.getByText('ai.top_selling').closest('button')).toBeDisabled();
      expect(screen.getByText('ai.trends').closest('button')).toBeDisabled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Messages
  // ─────────────────────────────────────────────────────────────────
  describe('messages display', () => {
    it('displays user messages with violet background', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'user', content: 'Hello AI', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      const msgEl = screen.getByText('Hello AI');
      expect(msgEl.closest('[class]')!.className).toContain('bg-violet-100');
    });

    it('displays assistant messages with gray background', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '2', role: 'assistant', content: 'Hello human', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      const msgEl = screen.getByText('Hello human');
      // The text is nested inside divs; the outermost message div has the bg class
      // Traverse up to the element that has rounded-xl (the message bubble)
      const bubble = msgEl.closest('[class*="rounded-xl"]')!;
      expect(bubble.className).toContain('bg-gray-100');
    });

    it('displays error messages (starting with ⚠️) with red background', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '3', role: 'assistant', content: '⚠️ Something went wrong', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      // The ⚠️ message is rendered via dangerouslySetInnerHTML so we match by text content
      const msgContainer = screen.getByText(/Something went wrong/);
      const bubble = msgContainer.closest('[class*="rounded-xl"]')!;
      expect(bubble.className).toContain('bg-red-50');
    });

    it('renders multiple messages in order', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [
          { id: '1', role: 'user', content: 'First', timestamp: 0 },
          { id: '2', role: 'assistant', content: 'Second', timestamp: 1 },
        ],
      });
      render(<AIInsightsPanel />);
      const allMsgs = screen.getAllByText(/First|Second/);
      expect(allMsgs[0]).toHaveTextContent('First');
      expect(allMsgs[1]).toHaveTextContent('Second');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. Markdown rendering
  // ─────────────────────────────────────────────────────────────────
  describe('markdown rendering', () => {
    it('renders bold text (**text**) as <strong>', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'assistant', content: 'This is **bold** text', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      const strongEl = document.querySelector('strong');
      expect(strongEl).toBeInTheDocument();
      expect(strongEl!.textContent).toBe('bold');
    });

    it('renders bullet points with a bullet character', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'assistant', content: '- item one\n- item two', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      // Bullet items use • character in a span with text-violet-500
      const bullets = document.querySelectorAll('.text-violet-500');
      expect(bullets.length).toBe(2);
      expect(bullets[0].textContent).toBe('•');
    });

    it('renders ## headers with font-bold class', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'assistant', content: '## Section Title', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      const headerEl = document.querySelector('.font-bold');
      expect(headerEl).toBeInTheDocument();
      expect(headerEl!.textContent).toBe('Section Title');
    });

    it('renders ### headers with font-semibold class', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'assistant', content: '### Subsection Title', timestamp: 0 }],
      });
      render(<AIInsightsPanel />);
      // Find the font-semibold element inside the message area (not the header title)
      const messageArea = screen.getByText(/Subsection Title/);
      const headerEl = messageArea.closest('.font-semibold');
      expect(headerEl).toBeInTheDocument();
      expect(headerEl!.textContent).toBe('Subsection Title');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. Input handling
  // ─────────────────────────────────────────────────────────────────
  describe('input handling', () => {
    it('typing updates the input field value', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Hello' } });
      expect(input.value).toBe('Hello');
    });

    it('pressing Enter sends the message', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder');
      fireEvent.change(input, { target: { value: 'My question' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockSendMessage).toHaveBeenCalledWith('My question');
    });

    it('pressing Shift+Enter does not send the message', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder');
      fireEvent.change(input, { target: { value: 'My question' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('send button is disabled when input is empty', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      // The send button is the only button with a Send icon inside the input area
      const sendBtn = screen.getByPlaceholderText('ai.input_placeholder')
        .closest('.flex')!
        .querySelector('button')!;
      expect(sendBtn).toBeDisabled();
    });

    it('send button is disabled when input is only whitespace', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder');
      fireEvent.change(input, { target: { value: '   ' } });
      const sendBtn = input.closest('.flex')!.querySelector('button')!;
      expect(sendBtn).toBeDisabled();
    });

    it('send button is disabled when loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, loading: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder');
      fireEvent.change(input, { target: { value: 'Hello' } });
      const sendBtn = input.closest('.flex')!.querySelector('button')!;
      expect(sendBtn).toBeDisabled();
    });

    it('clicking send button sends the message and clears input', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'My question' } });
      const sendBtn = input.closest('.flex')!.querySelector('button')!;
      fireEvent.click(sendBtn);
      expect(mockSendMessage).toHaveBeenCalledWith('My question');
      expect(input.value).toBe('');
    });

    it('does not send when input is empty and Enter is pressed', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      const input = screen.getByPlaceholderText('ai.input_placeholder');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 7. Loading state
  // ─────────────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows "Thinking..." spinner when loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, loading: true });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.thinking')).toBeInTheDocument();
    });

    it('shows an animated spinner icon when loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, loading: true });
      render(<AIInsightsPanel />);
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('does not show thinking text when not loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, loading: false });
      render(<AIInsightsPanel />);
      expect(screen.queryByText('ai.thinking')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 8. Error display
  // ─────────────────────────────────────────────────────────────────
  describe('error display', () => {
    it('shows error message when error is set and not loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, error: 'API limit exceeded', loading: false });
      render(<AIInsightsPanel />);
      expect(screen.getByText('API limit exceeded')).toBeInTheDocument();
    });

    it('hides error display when loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, error: 'API limit exceeded', loading: true });
      render(<AIInsightsPanel />);
      // Error div should not be shown while loading
      expect(screen.queryByText('API limit exceeded')).not.toBeInTheDocument();
    });

    it('hides error display when there is no error', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, error: null, loading: false });
      render(<AIInsightsPanel />);
      // There should be no red-50 error div
      const errorDiv = document.querySelector('.bg-red-50.text-red-700');
      expect(errorDiv).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 9. Close button
  // ─────────────────────────────────────────────────────────────────
  describe('close button', () => {
    it('calls togglePanel when close button is clicked', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      fireEvent.click(screen.getByTitle('ai.close'));
      expect(mockTogglePanel).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 10. Clear button
  // ─────────────────────────────────────────────────────────────────
  describe('clear button', () => {
    it('calls clearConversation when clear button is clicked', () => {
      mockStoreState = defaultStoreState({ panelOpen: true });
      render(<AIInsightsPanel />);
      fireEvent.click(screen.getByTitle('ai.clear'));
      expect(mockClearConversation).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 11. Empty state
  // ─────────────────────────────────────────────────────────────────
  describe('empty state', () => {
    it('shows "Ask anything" text when there are no messages and not loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [], loading: false });
      render(<AIInsightsPanel />);
      expect(screen.getByText('ai.empty_state')).toBeInTheDocument();
    });

    it('does not show "Ask anything" text when there are messages', () => {
      mockStoreState = defaultStoreState({
        panelOpen: true,
        messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: 0 }],
        loading: false,
      });
      render(<AIInsightsPanel />);
      expect(screen.queryByText('ai.empty_state')).not.toBeInTheDocument();
    });

    it('does not show "Ask anything" text when loading', () => {
      mockStoreState = defaultStoreState({ panelOpen: true, messages: [], loading: true });
      render(<AIInsightsPanel />);
      expect(screen.queryByText('ai.empty_state')).not.toBeInTheDocument();
    });
  });
});
