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

  return (
    <div className="border border-surface-border rounded-[4px] overflow-hidden">
      <div
        className="overflow-y-auto px-4 py-4 space-y-3"
        style={{ maxHeight: '320px' }}
      >
        {messages.length === 0 && (
          <p className="text-muted text-sm text-center py-6">
            Ask the agent about the analysis or add constraints…
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-[4px] text-sm font-light ${
                msg.role === 'user'
                  ? 'bg-surface text-primary'
                  : 'border-l-2 bg-surface text-secondary'
              }`}
              style={msg.role === 'agent' ? { borderColor: '#c8a96e' } : {}}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="border-l-2 bg-surface px-3 py-2 rounded-[4px]" style={{ borderColor: '#c8a96e' }}>
              <span className="text-muted text-sm animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-surface-border flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={disabled || isLoading}
          placeholder={disabled ? 'Chat unavailable during analysis…' : 'Message the agent…'}
          className="flex-1 bg-transparent px-4 py-3 text-sm text-primary placeholder-muted outline-none disabled:opacity-40"
        />
        <button
          onClick={send}
          disabled={disabled || isLoading || !input.trim()}
          className="px-4 py-3 text-accent text-sm tracking-widest uppercase hover:bg-surface disabled:opacity-30 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
