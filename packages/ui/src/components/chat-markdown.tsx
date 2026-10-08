import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/cn';

/**
 * Renders an AI assistant reply (markdown, GFM tables) inside a narrow chat
 * bubble. Used by the dashboard and POS `ChatWidget`s.
 *
 * Raw HTML in the source is NOT rendered (react-markdown's default — no
 * `rehype-raw`), so model output can't inject markup. Every element that can
 * be wider than the bubble (tables, code blocks, long tokens) either wraps
 * or scrolls inside its own box instead of overflowing the panel.
 */
const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-1 mt-2 text-[13px] font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-border pl-2 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
  pre: ({ children }) => (
    <pre className="my-1.5 max-w-full overflow-x-auto rounded bg-background/70 p-2 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={cn('rounded bg-background/70 px-1 py-0.5 font-mono text-[12px]', className)}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-1.5 max-w-full overflow-x-auto rounded border border-border" data-testid="chat-md-table">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background/60">{children}</thead>,
  th: ({ children, style }) => (
    <th style={style} className="whitespace-nowrap border-b border-border px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="whitespace-nowrap border-b border-border/60 px-2 py-1 tabular-nums">
      {children}
    </td>
  ),
};

export interface ChatMarkdownProps {
  children: string;
  className?: string;
}

export function ChatMarkdown({ children, className }: ChatMarkdownProps) {
  return (
    <div className={cn('min-w-0 break-words [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
