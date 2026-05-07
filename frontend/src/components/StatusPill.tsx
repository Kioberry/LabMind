import { SystemState } from '@/lib/types';

const STATE_LABELS: Record<SystemState, string> = {
  IDLE:           'IDLE',
  RUNNING:        'RUNNING',
  COMPLETE:       'COMPLETE',
  PROCESSING:     'PROCESSING',
  ANALYZING:      'ANALYZING',
  PROPOSAL_READY: 'PROPOSAL READY',
  EDITING:        'EDITING',
  REGENERATING:   'REGENERATING',
  APPROVED:       'APPROVED',
};

const ACTIVE_STATES: SystemState[] = ['RUNNING', 'PROCESSING', 'ANALYZING', 'REGENERATING'];

export default function StatusPill({ state }: { state: SystemState }) {
  const isActive = ACTIVE_STATES.includes(state);

  return (
    <div className="inline-flex items-center gap-2 border border-surface-border bg-surface px-3 py-1 rounded-[4px]">
      <span
        className={`w-1.5 h-1.5 rounded-full bg-accent ${isActive ? 'animate-pulse' : ''}`}
      />
      <span className="text-secondary text-label tracking-label uppercase">
        {STATE_LABELS[state]}
      </span>
    </div>
  );
}
