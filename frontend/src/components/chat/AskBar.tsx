import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useChatWidgetRef, useAiEnabled } from './ChatWidget';

/**
 * Top-bar "Ask HUF" input (PLAN.md item 6), matching the mockup's `.ask`
 * bar concept — a text-looking entry point that actually just opens the
 * floating `ChatWidget` pre-focused rather than being its own input surface,
 * plus the global ⌘K / Ctrl+K shortcut. Reads the single app-shell
 * `ChatWidget` instance via `useChatWidgetRef` rather than taking a prop, so
 * it can be dropped into any page without threading a ref through layouts.
 */
export default function AskBar() {
  const chatRef = useChatWidgetRef();
  const aiEnabled = useAiEnabled();

  useEffect(() => {
    if (!aiEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        chatRef.current?.openAndFocus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatRef, aiEnabled]);

  if (!aiEnabled) return null;

  return (
    <button
      type="button"
      onClick={() => chatRef.current?.openAndFocus()}
      className="flex w-full max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="rounded border border-chat-accent/30 bg-chat-accent/6 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-chat-accent">
        HUF
      </span>
      <span className="flex flex-1 items-center gap-1.5 truncate">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        Ask about tonight…
      </span>
      <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
        ⌘K
      </span>
    </button>
  );
}
