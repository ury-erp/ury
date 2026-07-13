import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Trash2, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { useAIStore } from '../../store/ai-store';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';

const AIInsightsPanel = () => {
  const {
    panelOpen,
    loading,
    error,
    messages,
    togglePanel,
    sendMessage,
    generateQuickInsight,
    clearConversation,
  } = useAIStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (panelOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [panelOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    sendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!panelOpen) {
    return (
      <button
        onClick={togglePanel}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 group"
        title={t('ai.open_panel') || 'AI Insights'}
      >
        <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
        <span className="text-sm font-medium hidden sm:inline">
          {t('ai.insights') || 'AI Insights'}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[600px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <h3 className="font-semibold text-sm">
            {t('ai.title') || 'AI Insights'}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearConversation}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title={t('ai.clear') || 'Clear conversation'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={togglePanel}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title={t('ai.close') || 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
          <p className="text-xs text-violet-700 mb-2 font-medium">
            {t('ai.quick_actions') || 'Quick actions'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateQuickInsight}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-violet-700 text-xs font-medium rounded-full border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t('ai.analyze_report') || 'Analyze Report'}
            </button>
            <button
              onClick={() => sendMessage(t('ai.default_question_top_items') || 'What are the top selling items?')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-violet-700 text-xs font-medium rounded-full border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t('ai.top_selling') || 'Top Items'}
            </button>
            <button
              onClick={() => sendMessage(t('ai.default_question_trends') || 'What trends do you see?')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-violet-700 text-xs font-medium rounded-full border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t('ai.trends') || 'Trends'}
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[360px]">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
            <Sparkles className="w-8 h-8 mb-2" />
            <p className="text-sm text-center">
              {t('ai.empty_state') || 'Ask anything about your report data'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'rounded-xl px-3 py-2.5 text-sm leading-relaxed max-w-[90%]',
              msg.role === 'user'
                ? 'bg-violet-100 text-violet-900 ml-auto'
                : msg.content.startsWith('⚠️')
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-gray-100 text-gray-800'
            )}
          >
            {/* Simple markdown-like rendering for assistant messages */}
            {msg.role === 'assistant' ? (
              <div className="whitespace-pre-wrap">
                {msg.content.split('\n').map((line, i) => {
                  // Bold: **text**
                  const boldParsed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                  // Bullet points
                  if (line.startsWith('- ') || line.startsWith('* ')) {
                    return (
                      <div key={i} className="flex gap-1.5">
                        <span className="text-violet-500 flex-shrink-0">•</span>
                        <span dangerouslySetInnerHTML={{ __html: boldParsed.slice(2) }} />
                      </div>
                    );
                  }
                  // Headers
                  if (line.startsWith('### ')) {
                    return <div key={i} className="font-semibold mt-1" dangerouslySetInnerHTML={{ __html: boldParsed.slice(4) }} />;
                  }
                  if (line.startsWith('## ')) {
                    return <div key={i} className="font-bold mt-1" dangerouslySetInnerHTML={{ __html: boldParsed.slice(3) }} />;
                  }
                  return <div key={i} dangerouslySetInnerHTML={{ __html: boldParsed }} />;
                })}
              </div>
            ) : (
              <span>{msg.content}</span>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-violet-600 text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('ai.thinking') || 'Thinking...'}</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.input_placeholder') || 'Ask about your reports...'}
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              input.trim() && !loading
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          {t('ai.disclaimer') || 'AI insights are suggestions — always verify with actual data'}
        </p>
      </div>
    </div>
  );
};

export default AIInsightsPanel;
