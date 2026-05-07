export type SystemState =
  | 'IDLE' | 'RUNNING' | 'COMPLETE' | 'PROCESSING' | 'ANALYZING'
  | 'PROPOSAL_READY' | 'EDITING' | 'REGENERATING' | 'APPROVED';

export interface ImageUrls {
  optimal: string;
  baseline: string;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export interface ParamRanges {
  pH: { min: number; max: number };
  temperature_c: { min: number; max: number };
  concentration_mg_ml: { min: number; max: number };
  incubation_hours: { min: number; max: number };
  lipid_ratio: string;
}

export interface ProposalSummary {
  experiment_count: number;
  param_ranges: ParamRanges;
  image_urls: ImageUrls;
}

export interface StatusResponse {
  current_state: SystemState;
  current_batch_id: string | null;
  pending_proposal_id: string | null;
  chat_history: ChatMessage[];
  latest_analysis: string | null;
  latest_constraints: string | null;
  image_urls: ImageUrls | null;
  proposal_summary: ProposalSummary | null;
  processing_log: string[];
  processing_log_step: string | null;
}

export interface ExperimentParameters {
  pH: number;
  temperature_c: number;
  concentration_mg_ml: number;
  lipid_ratio: string;
  incubation_hours: number;
}

export interface Experiment {
  exp_id: string;
  parameters: ExperimentParameters;
  transfection_rate: number | null;
  is_top_performer: boolean | null;
}

export interface BatchResponse {
  batch_id: string;
  description: string;
  status: string;
  created_at: string;
  experiments: Experiment[];
}

export interface BatchSummary {
  batch_id: string;
  description: string;
  status: string;
  experiment_count: number;
  best_transfection_rate: number | null;
  mean_transfection_rate: number | null;
}
