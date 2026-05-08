'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';
import StatusPill from './StatusPill';

export default function RunningView({ status }: { status: StatusResponse }) {
  const { current_state, current_batch_id } = status;
  const [loading, setLoading] = useState(false);

  const handleRunAnalysis = async () => {
    setLoading(true);
    await api.simulate();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
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

          <p className="text-secondary text-sm font-light text-center max-w-sm leading-relaxed">
            Batch {current_batch_id} experiments are running in the lab. When complete,
            click below to trigger AI image analysis and parameter optimization.
          </p>

          <button
            onClick={handleRunAnalysis}
            disabled={loading}
            className="border border-surface-border text-secondary px-6 py-2 text-sm tracking-widest uppercase hover:border-accent hover:text-accent disabled:opacity-40 transition-colors duration-200 flex items-center gap-2"
          >
            {loading && (
              <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            )}
            Run Analysis
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
