export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead';

export interface JobRecord {
  id: string;
  user_id: string;
  type: string;
  input_jsonb: Record<string, unknown>;
  status: JobStatus;
  phase: string | null;
  progress_pct: number | null;
  attempts: number;
  last_error: string | null;
  cost_usd: string | null;
  available_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface JobPhaseRecord {
  id: string;
  job_id: string;
  phase: string;
  output_jsonb: Record<string, unknown> | null;
  storage_path: string | null;
  completed_at: string;
}

export interface PhaseResult {
  phase: string;
  output?: Record<string, unknown>;
  storagePath?: string;
  progressPct?: number;
}
