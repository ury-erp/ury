import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@ury/ui';
import { useActiveReportContext } from './ActiveReportContext';
import { resolveReportNavigation, navigateToReportSlug } from './reportNavigation';

/**
 * `ChatWidget` mounts once in the app shell (see App.tsx); the ⌘K ask bar
 * lives on individual pages (e.g. Dashboard.tsx) and needs to open that one
 * instance. This context carries the ref App.tsx creates down to wherever
 * an ask bar wants it, without threading it through every layout prop.
 */
const ChatWidgetRefContext = createContext<React.RefObject<ChatWidgetHandle> | null>(null);

export function ChatWidgetRefProvider({
  chatRef,
  children,
}: {
  chatRef: React.RefObject<ChatWidgetHandle>;
  children: ReactNode;
}) {
  return <ChatWidgetRefContext.Provider value={chatRef}>{children}</ChatWidgetRefContext.Provider>;
}

export function useChatWidgetRef() {
  const ctx = useContext(ChatWidgetRefContext);
  if (!ctx) {
    throw new Error('useChatWidgetRef must be used within a ChatWidgetRefProvider');
  }
  return ctx;
}

/**
 * Whether the AI assistant is enabled for this org (see
 * `ury.ury.api.ury_ai_settings.get_ai_settings`, fetched once in App.tsx).
 * `ChatWidgetRefProvider` always mounts so `useChatWidgetRef()` never
 * throws, but visible entry points (AskBar, the floating ChatWidget) must
 * check this and render nothing when it's false. Defaults to `false`
 * (fail-closed) when read outside the provider.
 */
const AiEnabledContext = createContext(false);

export function AiEnabledProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <AiEnabledContext.Provider value={enabled}>{children}</AiEnabledContext.Provider>;
}

export function useAiEnabled() {
  return useContext(AiEnabledContext);
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatWidgetHandle {
  /** Opens the panel and focuses the input — used by the ⌘K ask bar. */
  openAndFocus: () => void;
}

/**
 * Floating, report-aware chat widget (PLAN.md items 4/5/6). Backed by
 * `ury/ury/api/ury_chat.py`'s three whitelisted methods:
 * `get_or_create_conversation`, `send_chat_message`, `get_chat_history`.
 *
 * Lazy-mounts: nothing is fetched until the panel is first opened, so the
 * widget never delays the dashboard's own initial render. If the backend
 * reports `{available: false}` (huf not installed, no Agent record, etc.)
 * the input is disabled with an explanatory line — never a red error box.
 */
const ChatWidget = forwardRef<ChatWidgetHandle>(function ChatWidget(_props, ref) {
  const { activeReport } = useActiveReportContext();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false); // lazy-mount gate
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null); // null = not yet known
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against double-starting the init fetch. Deliberately a ref, not
  // the `initializing` state: putting `initializing` in the effect's own
  // dependency array below causes the state update it makes to retrigger
  // the effect, which cancels the in-flight fetch via its own cleanup
  // before that fetch's `finally` ever runs — the request completes but
  // `cancelled` is already true by then, so `available`/`initializing` are
  // never reset and the widget is stuck showing "Connecting…" forever.
  const initStartedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    openAndFocus: () => {
      setOpen(true);
      setHasMounted(true);
      // Focus after the panel has had a chance to render.
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  }));

  // Lazy init: only talk to the backend once the panel has actually been
  // opened for the first time, and only once (conversation id is reused).
  useEffect(() => {
    if (!hasMounted || conversationId || initStartedRef.current) return;
    initStartedRef.current = true;

    let cancelled = false;
    const init = async () => {
      setInitializing(true);
      try {
        const { call } = await import('@ury/core');
        // POST, not GET: this can create a new Agent Conversation record,
        // and a GET request's DB transaction is never committed by Frappe.
        const res = await call.post('ury.ury.api.ury_chat.get_or_create_conversation', {
          report_context: activeReport ? JSON.stringify(activeReport) : undefined,
        });
        const data = res.message;
        if (cancelled) return;
        if (data?.available) {
          setAvailable(true);
          setConversationId(data.conversation_id);
        } else {
          setAvailable(false);
          setUnavailableReason(data?.reason ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          // Network/permission failure talking to our own whitelisted
          // endpoint (not a HUF-offline case, which comes back as a normal
          // {available: false} response above) — still degrade quietly
          // rather than throwing, per PLAN.md item 4.
          setAvailable(false);
          setUnavailableReason('Assistant is temporarily unavailable.');
          console.error('Error initializing HUF chat:', err);
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [hasMounted, conversationId, activeReport]);

  const handleOpen = () => {
    setOpen(true);
    setHasMounted(true);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !conversationId || sending) return;

    setSending(true);
    setDraft('');
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const { call } = await import('@ury/core');
      const res = await call.post('ury.ury.api.ury_chat.send_chat_message', {
        conversation_id: conversationId,
        message: text,
        report_context: activeReport ? JSON.stringify(activeReport) : undefined,
      });
      const data = res.message;

      if (!data?.available) {
        setAvailable(false);
        setUnavailableReason(data?.reason ?? null);
        return;
      }

      const responseText =
        typeof data.response === 'string'
          ? data.response
          : (data.response?.message ?? data.response?.text ?? JSON.stringify(data.response));

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text: responseText },
      ]);

      // PLAN.md item 5 — see reportNavigation.ts for the documented
      // assumption this narrow convention makes.
      const navigateSlug = resolveReportNavigation(data.response, responseText);
      if (navigateSlug) {
        navigateToReportSlug(navigate, navigateSlug);
      }
    } catch (err) {
      console.error('Error sending chat message:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          text: "Sorry, that message didn't go through. Try again in a moment.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisabled = available === false;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className={cn(
            'flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-lg',
            'border border-border bg-card shadow-lg'
          )}
          style={{ height: 460 }}
        >
          {/* Header — mirrors the mockup's HUF-branded "ask" chrome */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded border border-[rgba(91,63,214,0.3)] bg-[rgba(91,63,214,0.06)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-[#5B3FD6]">
                HUF
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {activeReport ? activeReport.label : 'Ask about tonight'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {available === false ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  The assistant isn't available right now.
                </p>
                {unavailableReason && (
                  <p className="text-xs text-muted-foreground/70">
                    Dashboard data is unaffected — this only disables chat.
                  </p>
                )}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                {initializing ? (
                  <p className="text-sm">Connecting…</p>
                ) : (
                  <p className="text-sm">
                    Ask about {activeReport ? activeReport.label.toLowerCase() : 'tonight'} —
                    e.g. &ldquo;which tables are running long?&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                      m.role === 'user'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : 'mr-auto bg-muted text-foreground'
                    )}
                  >
                    {m.text}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div
              className={cn(
                'flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2',
                isDisabled && 'opacity-60'
              )}
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDisabled || sending}
                placeholder={
                  isDisabled ? 'Assistant unavailable' : 'Ask HUF about tonight…'
                }
                className="flex-1 min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isDisabled || sending || !draft.trim() || !conversationId}
                className="text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
          aria-label="Open assistant chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
    </div>
  );
});

export default ChatWidget;
