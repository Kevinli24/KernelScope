import type { BenchmarkResult, Comparison, CreateJobInput, Job, Kernel } from './types.js';

export interface Repository {
  listKernels(): Promise<Kernel[]>;
  createJob(input: CreateJobInput): Promise<Job>;
  listJobs(limit: number, status?: string): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  markBaseline(jobId: string): Promise<Kernel | null>;
  compareJobs(baselineJobId: string, currentJobId: string): Promise<Comparison>;
  listRegressions(limit: number): Promise<Comparison[]>;
  getJobStatuses(
    since: Date,
  ): Promise<Pick<Job, 'id' | 'status' | 'started_at' | 'completed_at' | 'failure_message'>[]>;
  close(): Promise<void>;
}

export function calculateComparison(
  baselineJobId: string,
  currentJobId: string,
  baseline: BenchmarkResult,
  current: BenchmarkResult,
): Omit<Comparison, 'id' | 'created_at'> {
  const percent = (next: number, previous: number) => ((next - previous) / previous) * 100;
  const latencyChange = percent(current.average_latency_ms, baseline.average_latency_ms);
  return {
    baseline_job_id: baselineJobId,
    current_job_id: currentJobId,
    latency_change_percent: latencyChange,
    bandwidth_change_percent: percent(
      current.effective_bandwidth_gbps,
      baseline.effective_bandwidth_gbps,
    ),
    throughput_change_percent: percent(
      current.throughput_elements_per_second,
      baseline.throughput_elements_per_second,
    ),
    is_regression: current.average_latency_ms > baseline.average_latency_ms * 1.05,
    threshold_percent: 5,
  };
}
