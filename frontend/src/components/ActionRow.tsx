'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';

export default function ActionRow({ status }: { status: StatusResponse }) {
  const { current_state, pending_proposal_id, latest_constraints } = status;
  const [approvePending, setApprovePending] = useState(false);
  const [regenPending, setRegenPending] = useState(false);

  useEffect(() => {
    if (current_state !== 'APPROVED') setApprovePending(false);
    if (current_state !== 'REGENERATING') setRegenPending(false);
  }, [current_state]);

  const handleApprove = async () => {
    setApprovePending(true);
    await api.approve().catch(() => setApprovePending(false));
  };

  const handleRegenerate = async () => {
    setRegenPending(true);
    await api.regenerate().catch(() => setRegenPending(false));
  };

  const approveEnabled = current_state === 'PROPOSAL_READY' && !approvePending;
  const regenEnabled =
    (current_state === 'PROPOSAL_READY' || current_state === 'EDITING') &&
    !!latest_constraints &&
    !regenPending;

  return (
    <div className="flex gap-3">
      <button
        onClick={handleApprove}
        disabled={!approveEnabled}
        className="flex items-center gap-2 border px-6 py-2.5 text-sm tracking-widest uppercase transition-colors disabled:opacity-30"
        style={{
          borderColor: approveEnabled ? '#c8a96e' : 'rgba(255,255,255,0.07)',
          color: approveEnabled ? '#c8a96e' : 'rgba(255,255,255,0.25)',
        }}
      >
        {approvePending && <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />}
        Approve Batch {pending_proposal_id}
      </button>

      <button
        onClick={handleRegenerate}
        disabled={!regenEnabled}
        className="flex items-center gap-2 border border-surface-border text-secondary px-6 py-2.5 text-sm tracking-widest uppercase hover:border-accent hover:text-accent transition-colors disabled:opacity-30"
      >
        {regenPending && <span className="w-3 h-3 border border-secondary border-t-transparent rounded-full animate-spin" />}
        Regenerate Proposal
      </button>
    </div>
  );
}
