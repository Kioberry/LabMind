'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Experiment, ProposalSummary } from '@/lib/types';

function Chip({
  label,
  value,
  gold,
  green,
}: {
  label: string;
  value: string;
  gold?: boolean;
  green?: boolean;
}) {
  const borderColor = gold
    ? 'rgba(200,169,110,0.4)'
    : green
      ? 'rgba(80,138,104,0.42)'
      : 'rgba(255,255,255,0.09)';
  const bg = gold
    ? 'linear-gradient(145deg, rgba(200,169,110,0.09) 0%, rgba(200,169,110,0.03) 100%)'
    : green
      ? 'linear-gradient(145deg, rgba(80,138,104,0.10) 0%, rgba(80,138,104,0.03) 100%)'
      : 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)';
  const shadow = gold
    ? 'inset 0 1px 0 rgba(200,169,110,0.12)'
    : green
      ? 'inset 0 1px 0 rgba(80,138,104,0.14)'
      : 'inset 0 1px 0 rgba(255,255,255,0.05)';
  const textColor = gold ? '#c8a96e' : green ? '#6aaa82' : '#ffffff';

  return (
    <div
      className="chip-hover rounded-xl px-3 py-2 flex flex-col gap-0.5 cursor-default"
      style={{ border: `1px solid ${borderColor}`, background: bg, boxShadow: shadow }}
    >
      <p className="text-[9px] tracking-[0.16em] uppercase font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {label}
      </p>
      <p className="text-sm font-light" style={{ color: textColor }}>
        {value}
      </p>
    </div>
  );
}

export default function ParameterChips({
  batchId,
  proposalSummary,
}: {
  batchId: string | null;
  proposalSummary: ProposalSummary | null;
}) {
  const [topPerformer, setTopPerformer] = useState<Experiment | null>(null);

  useEffect(() => {
    if (!batchId) return;
    api.getBatch(batchId).then((batch) => {
      const top = batch.experiments.find((e) => e.is_top_performer);
      if (top) setTopPerformer(top);
    }).catch(() => {});
  }, [batchId]);

  return (
    <div className="space-y-4">
      {topPerformer && (
        <div className="glass-dark p-5">
          <p className="text-[9px] tracking-[0.16em] uppercase text-muted font-light mb-3 cursor-default">
            Current Top Performer
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip gold label="pH" value={topPerformer.parameters.pH.toFixed(2)} />
            <Chip gold label="Temp" value={`${topPerformer.parameters.temperature_c}°C`} />
            <Chip gold label="Conc" value={`${topPerformer.parameters.concentration_mg_ml.toFixed(3)} mg/mL`} />
            <Chip gold label="Lipid" value={topPerformer.parameters.lipid_ratio} />
            <Chip gold label="Hours" value={`${topPerformer.parameters.incubation_hours}h`} />
          </div>
        </div>
      )}

      {proposalSummary && (
        <div
          className="glass-dark p-5"
          style={{
            borderColor: 'rgba(80,138,104,0.32)',
            boxShadow: 'inset 0 1px 0 rgba(80,138,104,0.12), 0 2px 20px rgba(0,0,0,0.35)',
          }}
        >
          <p className="text-[9px] tracking-[0.16em] uppercase font-light mb-3 cursor-default" style={{ color: 'rgba(106,170,130,0.7)' }}>
            Proposed Range ({proposalSummary.experiment_count} experiments)
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip green label="pH" value={`${proposalSummary.param_ranges.pH.min}–${proposalSummary.param_ranges.pH.max}`} />
            <Chip green label="Temp" value={`${proposalSummary.param_ranges.temperature_c.min}–${proposalSummary.param_ranges.temperature_c.max}°C`} />
            <Chip green label="Conc" value={`${proposalSummary.param_ranges.concentration_mg_ml.min}–${proposalSummary.param_ranges.concentration_mg_ml.max} mg/mL`} />
            <Chip green label="Lipid" value={proposalSummary.param_ranges.lipid_ratio} />
            <Chip green label="Hours" value={`${proposalSummary.param_ranges.incubation_hours.min}–${proposalSummary.param_ranges.incubation_hours.max}h`} />
          </div>
        </div>
      )}
    </div>
  );
}
