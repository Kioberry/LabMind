import { useState } from 'react';
import { api } from '@/lib/api';
import { ChatMessage } from '@/lib/types';

export function useChat(initialHistory: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text: string): Promise<void> => {
    if (!text.trim() || isLoading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    try {
      const res = await api.chat(text);
      setMessages(prev => [...prev, { role: 'agent', content: res.response }]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
