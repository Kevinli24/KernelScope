export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Kernel {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  baseline_job_id: string | null;
}

export interface CreateJobInput {
  kernelId: string;
  inputSize: number;
  blockSize: number;
  warmupCount: number;
  trialCount: number;
  gitCommitHash: string;
}

export interface Job {
  id: string;
  kernel_id: string;
  kernel_slug: string;
  kernel_name: string;
  input_size: string | number;
  block_size: number;
  warmup_count: number;
  trial_count: number;
  git_commit_hash: string;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_message: string | null;
  result?: BenchmarkResult | null;
}

export interface BenchmarkResult {
  correct: boolean;
  actual_result: number;
  expected_result: number;
  relative_error: number;
  average_latency_ms: number;
  effective_bandwidth_gbps: number;
  throughput_elements_per_second: number;
  raw_output: Record<string, unknown>;
  gpu_name: string;
  cuda_version: string;
  compute_capability: string | null;
  driver_version: string | null;
  total_memory_bytes: string | number | null;
}

export interface Comparison {
  id: string;
  baseline_job_id: string;
  current_job_id: string;
  latency_change_percent: number;
  bandwidth_change_percent: number;
  throughput_change_percent: number;
  is_regression: boolean;
  threshold_percent: number;
  created_at: string;
  kernel_name?: string;
}
