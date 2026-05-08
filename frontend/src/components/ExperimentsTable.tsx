'use client';
import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Experiment, BatchSummary } from '@/lib/types';

type SortKey = 'transfection_rate' | 'exp_id' | 'pH' | 'temperature_c' | 'concentration_mg_ml' | 'incubation_hours';
type SortDir = 'asc' | 'desc';

interface FlatExperiment extends Experiment {
  batch_id: string;
}

function getValue(exp: FlatExperiment, key: SortKey): number | string {
  if (key === 'exp_id') return exp.exp_id;
  if (key === 'transfection_rate') return exp.transfection_rate ?? -1;
  return exp.parameters[key as keyof typeof exp.parameters] as number;
}

export default function ExperimentsTable() {
  const [allExperiments, setAllExperiments] = useState<FlatExperiment[]>([]);
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('transfection_rate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterBatch, setFilterBatch] = useState<string | null>(null);

  useEffect(() => {
    api.getAllBatches().then((sums) => {
      setSummaries(sums);
      const complete = sums.filter((s) => s.status === 'complete');
      Promise.all(complete.map((s) => api.getBatch(s.batch_id))).then((batches) => {
        const flat: FlatExperiment[] = batches.flatMap((b) =>
          b.experiments.map((e) => ({ ...e, batch_id: b.batch_id }))
        );
        setAllExperiments(flat);
      });
    }).catch(() => {});
  }, []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const displayed = useMemo(() => {
    const filtered = filterBatch
      ? allExperiments.filter((e) => e.batch_id === filterBatch)
      : allExperiments;

    return [...filtered].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [allExperiments, filterBatch, sortKey, sortDir]);

  const cols: { key: SortKey; label: string }[] = [
    { key: 'exp_id', label: 'Exp ID' },
    { key: 'pH', label: 'pH' },
    { key: 'temperature_c', label: 'Temp °C' },
    { key: 'concentration_mg_ml', label: 'Conc mg/mL' },
    { key: 'incubation_hours', label: 'Hours' },
    { key: 'transfection_rate', label: 'Transfection' },
  ];

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div className="flex-1 overflow-y-auto bg-background px-8 py-10 max-w-6xl mx-auto">
      <p className="text-label tracking-label uppercase text-secondary mb-6">
        Experiments
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterBatch(null)}
          className={`text-xs px-3 py-1 border rounded-[4px] transition-colors ${
            filterBatch === null
              ? 'border-accent text-accent'
              : 'border-surface-border text-muted hover:border-secondary'
          }`}
        >
          All
        </button>
        {summaries.map((s) => (
          <button
            key={s.batch_id}
            onClick={() => setFilterBatch(s.batch_id)}
            className={`text-xs px-3 py-1 border rounded-[4px] transition-colors ${
              filterBatch === s.batch_id
                ? 'border-accent text-accent'
                : 'border-surface-border text-muted hover:border-secondary'
            }`}
          >
            {s.batch_id}
          </button>
        ))}
      </div>

      <div className="border border-surface-border rounded-[4px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-3 py-2 text-muted text-label tracking-label uppercase">
                Batch
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="text-left px-3 py-2 text-muted text-label tracking-label uppercase cursor-pointer hover:text-secondary select-none"
                >
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((exp) => {
              const rate = exp.transfection_rate ?? 0;
              return (
                <tr
                  key={exp.exp_id}
                  className="border-b border-surface-border hover:bg-surface transition-colors"
                  style={
                    exp.is_top_performer
                      ? { borderLeft: '2px solid #c8a96e' }
                      : {}
                  }
                >
                  <td className="px-3 py-2 text-muted">{exp.batch_id}</td>
                  <td className="px-3 py-2 text-secondary">{exp.exp_id}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.pH}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.temperature_c}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.concentration_mg_ml}</td>
                  <td className="px-3 py-2 text-secondary">{exp.parameters.incubation_hours}</td>
                  <td className="px-3 py-2">
                    <div className="relative h-5 rounded-sm overflow-hidden bg-surface min-w-[80px]">
                      <div
                        className="absolute inset-y-0 left-0 bg-accent opacity-20"
                        style={{ width: `${rate * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-1.5 text-primary text-xs">
                        {exp.transfection_rate != null
                          ? `${(rate * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
