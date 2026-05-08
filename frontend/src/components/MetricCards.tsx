'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusResponse, BatchSummary } from '@/lib/types';

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-5 flex flex-col gap-2 cursor-default">
      <p className="text-[10px] tracking-[0.16em] uppercase font-light hover-green" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </p>
      <p className="text-primary text-3xl font-light">{value}</p>
    </div>
  );
}

export default function MetricCards({ status }: { status: StatusResponse }) {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);

  useEffect(() => {
    api.getAllBatches().then(setSummaries).catch(() => {});
  }, [status.current_batch_id]);

  const current = summaries.find((s) => s.batch_id === status.current_batch_id);
  const currentIndex = summaries.findIndex((s) => s.batch_id === status.current_batch_id);
  const previous = currentIndex > 0 ? summaries[currentIndex - 1] : null;

  const bestRate =
    current?.best_transfection_rate != null
      ? `${Math.round(current.best_transfection_rate * 100)}%`
      : '—';

  const batchMean =
    current?.mean_transfection_rate != null
      ? `${Math.round(current.mean_transfection_rate * 100)}%`
      : '—';

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
      <Card label="Best Efficiency" value={bestRate} />
      <Card label="Batch Mean" value={batchMean} />
      <Card label="vs Prior Batch" value={vsPrior} />
    </div>
  );
}
