'use client';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';
import StatusPill from './StatusPill';

export default function RunningView({ status }: { status: StatusResponse }) {
  const { current_state, current_batch_id } = status;

  const handleSimulate = async () => {
    await api.simulate();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <StatusPill state={current_state} />

      <p className="text-secondary text-sm tracking-label uppercase">
        Batch {current_batch_id}
      </p>

      {current_state === 'RUNNING' && (
        <>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <button
            onClick={handleSimulate}
            className="border border-surface-border text-secondary px-6 py-2 text-sm tracking-widest uppercase hover:border-accent hover:text-accent transition-colors duration-200"
          >
            Simulate Complete
          </button>
        </>
      )}

      {current_state === 'COMPLETE' && (
        <p className="text-secondary text-sm animate-pulse">Preparing analysis…</p>
      )}

      {current_state === 'APPROVED' && (
        <p className="text-secondary text-sm animate-pulse">Writing batch data…</p>
      )}
    </div>
  );
}
