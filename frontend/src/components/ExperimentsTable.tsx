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
    <div className="flex-1 overflow-y-auto px-8 py-10 w-full">
      <p className="text-xs tracking-[0.2em] uppercase font-light text-secondary mb-6">
        Experiments
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterBatch(null)}
          className={`text-xs px-4 py-1.5 border rounded-[4px] transition-colors ${
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
            className={`text-xs px-4 py-1.5 border rounded-[4px] transition-colors ${
              filterBatch === s.batch_id
                ? 'border-accent text-accent'
                : 'border-surface-border text-muted hover:border-secondary'
            }`}
          >
            {s.batch_id}
          </button>
        ))}
      </div>

      <div className="glass-gleam overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="text-left px-5 py-4 text-muted text-xs tracking-[0.14em] uppercase font-light">
                Batch
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="text-left px-5 py-4 text-muted text-xs tracking-[0.14em] uppercase font-light cursor-pointer hover:text-secondary select-none transition-colors"
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
                  className="transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: exp.is_top_performer
                      ? 'rgba(200,169,110,0.05)'
                      : undefined,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = exp.is_top_performer
                      ? 'rgba(200,169,110,0.09)'
                      : 'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = exp.is_top_performer
                      ? 'rgba(200,169,110,0.05)'
                      : '';
                  }}
                >
                  <td className="px-5 py-4 text-base font-light text-muted">{exp.batch_id}</td>
                  <td className="px-5 py-4 text-base font-light" style={{ color: exp.is_top_performer ? '#c8a96e' : 'rgba(255,255,255,0.65)' }}>{exp.exp_id}</td>
                  <td className="px-5 py-4 text-base font-light text-secondary">{exp.parameters.pH}</td>
                  <td className="px-5 py-4 text-base font-light text-secondary">{exp.parameters.temperature_c}</td>
                  <td className="px-5 py-4 text-base font-light text-secondary">{exp.parameters.concentration_mg_ml}</td>
                  <td className="px-5 py-4 text-base font-light text-secondary">{exp.parameters.incubation_hours}</td>
                  <td className="px-5 py-4">
                    <div className="relative h-6 rounded-sm overflow-hidden min-w-[100px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${rate * 100}%`,
                          background: exp.is_top_performer
                            ? 'rgba(200,169,110,0.28)'
                            : 'rgba(200,169,110,0.15)',
                        }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-sm font-light" style={{ color: exp.is_top_performer ? '#c8a96e' : 'rgba(255,255,255,0.75)' }}>
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
