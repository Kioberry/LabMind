'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Experiment, ProposalSummary } from '@/lib/types';

function Chip({
  label,
  value,
  gold,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div
      className="border rounded-[4px] px-3 py-1.5 flex flex-col gap-0.5"
      style={{
        borderColor: gold ? 'rgba(200,169,110,0.4)' : 'rgba(255,255,255,0.07)',
        backgroundColor: gold ? 'rgba(200,169,110,0.05)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <p className="text-label tracking-label uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </p>
      <p className="text-sm font-light" style={{ color: gold ? '#c8a96e' : '#ffffff' }}>
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
        <div>
          <p className="text-label tracking-label uppercase text-muted mb-2">
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
        <div>
          <p className="text-label tracking-label uppercase text-muted mb-2">
            Proposed Range ({proposalSummary.experiment_count} experiments)
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip label="pH" value={`${proposalSummary.param_ranges.pH.min}–${proposalSummary.param_ranges.pH.max}`} />
            <Chip label="Temp" value={`${proposalSummary.param_ranges.temperature_c.min}–${proposalSummary.param_ranges.temperature_c.max}°C`} />
            <Chip label="Conc" value={`${proposalSummary.param_ranges.concentration_mg_ml.min}–${proposalSummary.param_ranges.concentration_mg_ml.max} mg/mL`} />
            <Chip label="Lipid" value={proposalSummary.param_ranges.lipid_ratio} />
            <Chip label="Hours" value={`${proposalSummary.param_ranges.incubation_hours.min}–${proposalSummary.param_ranges.incubation_hours.max}h`} />
          </div>
        </div>
      )}
    </div>
  );
}
