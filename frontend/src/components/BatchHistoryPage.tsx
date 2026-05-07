'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BatchSummary, BatchResponse } from '@/lib/types';

function rateToColor(rate: number): string {
  const v = Math.round(26 + (255 - 26) * Math.max(0, Math.min(1, rate)));
  return `rgb(${v}, ${v}, ${v})`;
}

function rateToTextColor(rate: number): string {
  return rate > 0.55 ? '#0a0a09' : 'rgba(255,255,255,0.6)';
}

function TrendLine({ summaries }: { summaries: BatchSummary[] }) {
  const w = 300;
  const h = 80;
  const pad = 8;
  const data = summaries
    .filter((s) => s.best_transfection_rate != null)
    .map((s) => s.best_transfection_rate as number);

  if (data.length < 2) return null;

  const xStep = (w - pad * 2) / (data.length - 1);
  const points = data
    .map((rate, i) => {
      const x = pad + i * xStep;
      const y = pad + (1 - rate) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className="block">
      <polyline
        points={points}
        fill="none"
        stroke="#c8a96e"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((rate, i) => (
        <circle
          key={i}
          cx={pad + i * xStep}
          cy={pad + (1 - rate) * (h - pad * 2)}
          r="2.5"
          fill="#c8a96e"
        />
      ))}
    </svg>
  );
}

export default function BatchHistoryPage() {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [batches, setBatches] = useState<BatchResponse[]>([]);

  useEffect(() => {
    api.getAllBatches().then((sums) => {
      setSummaries(sums);
      const complete = sums.filter((s) => s.status === 'complete');
      Promise.all(complete.map((s) => api.getBatch(s.batch_id))).then(setBatches);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background px-8 py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <p className="text-label tracking-label uppercase text-secondary">
          Experiment History
        </p>
        <TrendLine summaries={summaries} />
      </div>

      <div className="space-y-8">
        {batches.map((batch) => {
          const top = batch.experiments.find((e) => e.is_top_performer);
          return (
            <div key={batch.batch_id} className="border border-surface-border rounded-[4px] p-6">
              <div className="flex items-baseline gap-3 mb-4">
                <p className="text-accent text-label tracking-label uppercase">
                  Batch {batch.batch_id}
                </p>
                <p className="text-muted text-xs">{batch.description}</p>
              </div>

              <div className="flex gap-0.5 mb-4">
                {batch.experiments.map((exp) => {
                  const rate = exp.transfection_rate ?? 0;
                  return (
                    <div
                      key={exp.exp_id}
                      title={`${exp.exp_id}: ${(rate * 100).toFixed(0)}%`}
                      className="flex-1 h-8 rounded-sm flex items-center justify-center text-[8px] font-medium"
                      style={{
                        backgroundColor: rateToColor(rate),
                        color: rateToTextColor(rate),
                      }}
                    >
                      {(rate * 100).toFixed(0)}
                    </div>
                  );
                })}
              </div>

              {top && (
                <div className="flex gap-3 flex-wrap">
                  <p className="text-muted text-xs">Top performer:</p>
                  {Object.entries(top.parameters).map(([k, v]) => (
                    <span key={k} className="text-accent text-xs">
                      {k.replace(/_/g, ' ')} {v}
                    </span>
                  ))}
                  <span className="text-secondary text-xs ml-auto">
                    {top.transfection_rate != null
                      ? `${(top.transfection_rate * 100).toFixed(0)}% transfection`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
