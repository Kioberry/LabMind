'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { api } from '@/lib/api';
import { BatchSummary, BatchResponse } from '@/lib/types';

interface TrendPoint {
  batch: string;
  best: number;
  mean: number;
}

interface DistPoint {
  exp: string;
  rate: number;
  isTop: boolean;
}

const ACCENT = '#c8a96e';
const MUTED = 'rgba(255,255,255,0.25)';
const GRID = 'rgba(255,255,255,0.07)';
const TEXT = 'rgba(255,255,255,0.45)';

function InsightPanel({ summaries, detail }: { summaries: BatchSummary[]; detail: BatchResponse | null }) {
  const insights: string[] = [];

  if (summaries.length >= 2) {
    const last = summaries[summaries.length - 1];
    const prev = summaries[summaries.length - 2];
    if (last.best_transfection_rate != null && prev.best_transfection_rate != null && prev.best_transfection_rate > 0) {
      const pct = Math.round(((last.best_transfection_rate - prev.best_transfection_rate) / prev.best_transfection_rate) * 100);
      insights.push(`Best efficiency ${pct > 0 ? 'improved' : 'declined'} ${pct > 0 ? '+' : ''}${pct}% from ${prev.batch_id} → ${last.batch_id}.`);
    }
  }

  if (summaries.length >= 2) {
    const means = summaries.filter(s => s.mean_transfection_rate != null).map(s => s.mean_transfection_rate as number);
    if (means.length >= 2) {
      const recent = means[means.length - 1];
      const older = means[means.length - 2];
      const delta = Math.abs(recent - older);
      if (delta < 0.03) {
        insights.push(`Batch mean is stabilizing around ${Math.round(recent * 100)}%, indicating approach to a local optimum.`);
      } else {
        insights.push(`Batch mean shifted by ${Math.round(delta * 100)}% — optimization is still converging.`);
      }
    }
  }

  if (detail) {
    const rates = detail.experiments.map(e => e.transfection_rate ?? 0);
    const top = Math.max(...rates);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    insights.push(`Current batch spread: top ${Math.round(top * 100)}% vs mean ${Math.round(mean * 100)}% — variance ${Math.round((top - mean) * 100)}%.`);
  }

  if (summaries.length > 0) {
    const complete = summaries.filter(s => s.status === 'complete').length;
    insights.push(`${complete} of ${summaries.length} total batch${summaries.length !== 1 ? 'es' : ''} completed.`);
  }

  return (
    <div className="glass-panel p-6">
      <p className="text-sm tracking-[0.18em] uppercase font-light mb-6 cursor-default" style={{ color: 'rgba(255,255,255,0.55)' }}>
        Insights
      </p>
      {insights.length === 0 ? (
        <p className="text-muted text-sm font-light">No batches available yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((line, i) => (
            <li key={i} className="text-sm font-light text-primary flex gap-3">
              <span className="text-accent mt-0.5 shrink-0">—</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalysisDashboard() {
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [currentDetail, setCurrentDetail] = useState<BatchResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await api.getAllBatches();
        setSummaries(all);
        const complete = all.filter(s => s.status === 'complete');
        if (complete.length > 0) {
          const latest = complete[complete.length - 1];
          const detail = await api.getBatch(latest.batch_id);
          setCurrentDetail(detail);
        }
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const trendData: TrendPoint[] = summaries
    .filter(s => s.best_transfection_rate != null)
    .map(s => ({
      batch: s.batch_id,
      best: Math.round((s.best_transfection_rate ?? 0) * 1000) / 10,
      mean: Math.round((s.mean_transfection_rate ?? 0) * 1000) / 10,
    }));

  const distData: DistPoint[] = currentDetail
    ? currentDetail.experiments.map(e => ({
        exp: e.exp_id.split('-').slice(-1)[0],
        rate: Math.round((e.transfection_rate ?? 0) * 1000) / 10,
        isTop: e.is_top_performer ?? false,
      }))
    : [];

  const tooltipStyle = {
    backgroundColor: 'rgba(14,14,12,0.96)',
    border: '1px solid rgba(200,169,110,0.25)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 300,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-8 py-10 max-w-5xl mx-auto">
        <p className="text-sm tracking-[0.2em] uppercase font-light mb-8 cursor-default" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Analysis
        </p>

        {loading ? (
          <p className="text-muted text-sm animate-pulse">Loading data…</p>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Efficiency trend line chart */}
            <div className="glass-panel p-6">
              <p className="text-[10px] tracking-[0.18em] uppercase font-light mb-6 hover-green cursor-default" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Efficiency Trend — Best &amp; Mean Per Batch
              </p>
              {trendData.length < 2 ? (
                <p className="text-muted text-sm font-light">Need at least 2 complete batches to show trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
                    <XAxis dataKey="batch" tick={{ fill: TEXT, fontSize: 10, fontWeight: 300 }} axisLine={false} tickLine={false} />
                    <YAxis unit="%" tick={{ fill: TEXT, fontSize: 10, fontWeight: 300 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ stroke: 'rgba(200,169,110,0.2)', strokeWidth: 1 }}
                      formatter={(v) => [v != null ? `${Number(v)}%` : '—']}
                    />
                    <Line type="monotone" dataKey="best" stroke={ACCENT} strokeWidth={1.5} dot={{ fill: ACCENT, r: 3 }} name="Best" />
                    <Line type="monotone" dataKey="mean" stroke={MUTED} strokeWidth={1} dot={{ fill: MUTED, r: 2 }} strokeDasharray="4 2" name="Mean" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Current batch bar chart */}
            <div className="glass-panel p-6">
              <p className="text-[10px] tracking-[0.18em] uppercase font-light mb-6 hover-green cursor-default" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Latest Complete Batch Distribution
                {currentDetail ? ` — ${currentDetail.batch_id}` : ''}
              </p>
              {distData.length === 0 ? (
                <p className="text-muted text-sm font-light">No complete batch data available.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={distData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="exp" tick={{ fill: TEXT, fontSize: 9, fontWeight: 300 }} axisLine={false} tickLine={false} />
                    <YAxis unit="%" tick={{ fill: TEXT, fontSize: 10, fontWeight: 300 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      formatter={(v) => [v != null ? `${Number(v)}%` : '—']}
                    />
                    <Bar
                      dataKey="rate"
                      name="Efficiency"
                      radius={[3, 3, 0, 0]}
                      activeBar={false}
                    >
                      {distData.map((d, i) => (
                        <Cell key={i} fill={d.isTop ? ACCENT : 'rgba(255,255,255,0.15)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Insights panel */}
            <InsightPanel summaries={summaries} detail={currentDetail} />
          </div>
        )}
      </div>
    </div>
  );
}
