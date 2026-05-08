'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ChatMessage } from '@/lib/types';

export default function ChatInterface({
  history,
  disabled,
}: {
  history: ChatMessage[];
  disabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(history);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(history);
  }, [history]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading || disabled) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    try {
      const res = await api.chat(text);
      setMessages((prev) => [...prev, { role: 'agent', content: res.response }]);
    } finally {
      setIsLoading(false);
    }
  };

  const hasMessages = messages.length > 0 || isLoading;

  return (
    <div className="flex flex-col gap-3">
      {/* Message history — hidden when empty */}
      {hasMessages && (
        <div className="overflow-y-auto max-h-40 space-y-2 px-1">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm font-light ${
                  msg.role === 'user'
                    ? 'bg-surface text-primary'
                    : 'text-secondary'
                }`}
                style={
                  msg.role === 'agent'
                    ? {
                        background: 'rgba(200,169,110,0.06)',
                        border: '1px solid rgba(200,169,110,0.18)',
                      }
                    : { border: '1px solid rgba(255,255,255,0.07)' }
                }
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div
                className="px-3 py-1.5 rounded-2xl"
                style={{
                  background: 'rgba(200,169,110,0.06)',
                  border: '1px solid rgba(200,169,110,0.18)',
                }}
              >
                <span className="text-muted text-sm animate-pulse">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Pill-shaped input bar */}
      <div
        className="chat-pill-wrapper group flex items-center gap-0 rounded-full overflow-hidden transition-all duration-300"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(200,169,110,0.02) 100%)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          opacity: disabled ? 0.5 : 0.85,
        }}
        onFocus={() => {}} // handled by CSS
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={disabled || isLoading}
          placeholder={disabled ? 'Analysis in progress…' : 'Ask the agent or add a constraint…'}
          className="flex-1 bg-transparent px-5 py-3 text-sm text-primary placeholder-muted outline-none disabled:opacity-60 font-light"
          style={{ minWidth: 0 }}
          onFocus={(e) => {
            const parent = e.currentTarget.parentElement;
            if (parent) {
              parent.style.borderColor = 'rgba(200,169,110,0.4)';
              parent.style.boxShadow = '0 0 0 1px rgba(200,169,110,0.15), inset 0 1px 0 rgba(255,255,255,0.06)';
              parent.style.opacity = '1';
            }
          }}
          onBlur={(e) => {
            const parent = e.currentTarget.parentElement;
            if (parent) {
              parent.style.borderColor = 'rgba(255,255,255,0.09)';
              parent.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.06)';
              parent.style.opacity = disabled ? '0.5' : '0.85';
            }
          }}
        />
        <button
          onClick={send}
          disabled={disabled || isLoading || !input.trim()}
          className="px-5 py-3 text-xs tracking-[0.18em] uppercase font-light transition-colors duration-200 disabled:opacity-30 shrink-0"
          style={{ color: '#c8a96e' }}
        >
          {isLoading ? (
            <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            'Send'
          )}
        </button>
      </div>
    </div>
  );
}
