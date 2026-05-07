'use client';

import { useRef, useEffect } from 'react';
import type { StatusResponse } from '@/lib/types';
import StatusPill from './StatusPill';

interface ProcessingViewProps {
  status: StatusResponse;
}

export default function ProcessingView({ status }: ProcessingViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const logs = status.processing_log ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <StatusPill state={status.current_state} />
          {status.current_batch_id && (
            <span className="text-muted uppercase tracking-label text-label font-light">
              Batch {status.current_batch_id}
            </span>
          )}
        </div>

        {/* Log panel */}
        <div className="border border-surface-border rounded-[4px]">
          <div className="px-4 py-2 border-b border-surface-border">
            <span className="text-muted uppercase tracking-label text-label font-light">
              LabMind Agent
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto p-4 font-mono text-sm flex flex-col gap-0.5">
            {logs.length === 0 ? (
              <span className="text-log">
                Initializing image processing…
              </span>
            ) : (
              logs.map((line, i) => (
                <span key={i} className="text-log py-0.5">
                  {line}
                </span>
              ))
            )}
            {/* Pulsing indicator — always shown while in this view */}
            <span className="mt-1 flex items-center gap-2 text-log">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </span>
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
