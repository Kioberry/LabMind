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
    <div
      className="animate-gold-breath rounded-[14px] overflow-hidden"
      style={{
        border: '1px solid rgba(200,169,110,0.22)',
      }}
    >
      <div
        className="px-5 py-3"
        style={{ borderBottom: '1px solid rgba(200,169,110,0.12)', background: 'rgba(200,169,110,0.04)' }}
      >
        <span className="text-muted uppercase tracking-[0.16em] text-[9px] font-light">
          LabMind Agent
        </span>
      </div>
      <div
        className="max-h-72 overflow-y-auto p-5 font-mono text-sm flex flex-col gap-0.5"
        style={{ background: 'linear-gradient(180deg, rgba(200,169,110,0.02) 0%, transparent 100%)' }}
      >
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-10 max-w-5xl mx-auto">
          <div className="mb-6">
            <StatusPill state={current_state} />
          </div>

          <p className="text-secondary text-[10px] tracking-[0.18em] uppercase font-light mb-8 hover-green cursor-default">
            Batch {current_batch_id}
            {pending_proposal_id ? ` → ${pending_proposal_id} Proposal` : ''}
          </p>

          <MetricCards status={status} />

          <div className="mt-8">
            {isThinking ? (
              <ThinkingPanel logs={status.processing_log ?? []} />
            ) : (
              <div className="animate-fadeIn">
                <ImageComparison imageUrls={status.image_urls} />
              </div>
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

        </div>
      </div>

      {/* Pinned bottom: chat + actions */}
      <div className="shrink-0">
        <div className="max-w-5xl mx-auto px-8 py-5">
          <ChatInterface history={status.chat_history} disabled={chatDisabled} />
          <div className="mt-4">
            <ActionRow status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
