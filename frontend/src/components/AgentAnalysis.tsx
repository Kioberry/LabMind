'use client';
import { useRef, useEffect } from 'react';
import { StatusResponse } from '@/lib/types';
import StatusPill from './StatusPill';
import MetricCards from './MetricCards';
import ImageComparison from './ImageComparison';
import AnalysisText from './AnalysisText';
import ParameterChips from './ParameterChips';
import ChatInterface from './ChatInterface';
import ActionRow from './ActionRow';

const THINKING_STATES = ['PROCESSING', 'ANALYZING'] as const;

function ThinkingPanel({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="border border-surface-border rounded-[4px]">
      <div className="px-4 py-2 border-b border-surface-border">
        <span className="text-muted uppercase tracking-label text-label font-light">
          LabMind Agent
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto p-4 font-mono text-sm flex flex-col gap-0.5">
        {logs.length === 0 ? (
          <span className="text-log">Initializing image processing…</span>
        ) : (
          logs.map((line, i) => (
            <span key={i} className="text-log py-0.5">
              {line}
            </span>
          ))
        )}
        <span className="mt-1 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        </span>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function AgentAnalysis({ status }: { status: StatusResponse }) {
  const { current_state, current_batch_id, pending_proposal_id } = status;
  const isThinking = (THINKING_STATES as readonly string[]).includes(current_state);
  const chatDisabled =
    current_state === 'PROCESSING' ||
    current_state === 'ANALYZING' ||
    current_state === 'REGENERATING';

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-10 max-w-5xl mx-auto">
          <div className="mb-6">
            <StatusPill state={current_state} />
          </div>

          <p className="text-secondary text-label tracking-label uppercase mb-8">
            Batch {current_batch_id}
            {pending_proposal_id ? ` → ${pending_proposal_id} Proposal` : ''}
          </p>

          <MetricCards status={status} />

          <div className="mt-8">
            {isThinking ? (
              <ThinkingPanel logs={status.processing_log ?? []} />
            ) : (
              <ImageComparison imageUrls={status.image_urls} />
            )}
          </div>

          <div className="mt-8">
            <AnalysisText
              text={status.latest_analysis}
              isLoading={current_state === 'ANALYZING'}
            />
          </div>

          <div className="mt-8">
            <ParameterChips
              batchId={current_batch_id}
              proposalSummary={status.proposal_summary}
            />
          </div>

          <hr className="my-8 border-surface-border" />
        </div>
      </div>

      {/* Pinned bottom: chat + actions — always visible */}
      <div className="border-t border-surface-border bg-background">
        <div className="max-w-5xl mx-auto px-8 py-4">
          <ChatInterface history={status.chat_history} disabled={chatDisabled} />
          <div className="mt-4">
            <ActionRow status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
