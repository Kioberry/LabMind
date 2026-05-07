'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusResponse, BatchSummary } from '@/lib/types';

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-surface-border bg-surface rounded-[4px] p-5 flex flex-col gap-2">
      <p className="text-secondary text-label tracking-label uppercase">{label}</p>
      <p className="text-primary text-3xl font-light">{value}</p>
    </div>
  );
}

export default function MetricCards({ status }: { status: StatusResponse }) {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);

  useEffect(() => {
    api.getAllBatches().then(setSummaries).catch(() => {});
  }, []);

  const current = summaries.find((s) => s.batch_id === status.current_batch_id);
  const currentIndex = summaries.findIndex((s) => s.batch_id === status.current_batch_id);
  const previous = currentIndex > 0 ? summaries[currentIndex - 1] : null;

  const bestRate =
    current?.best_transfection_rate != null
      ? `${Math.round(current.best_transfection_rate * 100)}%`
      : '—';

  // vs prior batch: compare best-to-best, shown only when both are real numbers
  let vsPrior = '—';
  if (
    current?.best_transfection_rate != null &&
    previous?.best_transfection_rate != null &&
    previous.best_transfection_rate > 0
  ) {
    const pct =
      ((current.best_transfection_rate - previous.best_transfection_rate) /
        previous.best_transfection_rate) *
      100;
    vsPrior = `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card label="Current Batch" value={status.current_batch_id ?? '—'} />
      <Card label="Best Transfection" value={bestRate} />
      <Card label="Next Proposal" value={status.pending_proposal_id ?? '—'} />
      <Card label="vs Prior Batch" value={vsPrior} />
    </div>
  );
}
