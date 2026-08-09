import type { Repository } from '../src/repository.js';
import type { Comparison, CreateJobInput, Job, Kernel } from '../src/types.js';

export const kernel: Kernel = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'reduction-naive',
  name: 'Naive FP32 Reduction',
  description: 'test kernel',
  enabled: true,
  baseline_job_id: null,
};

export const job: Job = {
  id: '22222222-2222-4222-8222-222222222222',
  kernel_id: kernel.id,
  kernel_slug: kernel.slug,
  kernel_name: kernel.name,
  input_size: 1_048_576,
  block_size: 256,
  warmup_count: 5,
  trial_count: 20,
  git_commit_hash: 'abcdef1',
  status: 'queued',
  created_at: '2026-01-01T00:00:00.000Z',
  started_at: null,
  completed_at: null,
  failure_message: null,
};

export class FakeRepository implements Repository {
  kernels = [kernel];
  jobs = [job];

  async listKernels() {
    return this.kernels;
  }

  async createJob(input: CreateJobInput) {
    if (input.kernelId !== kernel.id) throw new Error('KERNEL_NOT_FOUND');
    return { ...job, ...input, input_size: input.inputSize, block_size: input.blockSize };
  }

  async listJobs() {
    return this.jobs;
  }

  async getJob(id: string) {
    return this.jobs.find((entry) => entry.id === id) ?? null;
  }

  async markBaseline(jobId: string) {
    if (jobId !== job.id || job.status !== 'completed') return null;
    return { ...kernel, baseline_job_id: jobId };
  }

  async compareJobs(): Promise<Comparison> {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      baseline_job_id: job.id,
      current_job_id: '44444444-4444-4444-8444-444444444444',
      latency_change_percent: 6,
      bandwidth_change_percent: -5.66,
      throughput_change_percent: -5.66,
      is_regression: true,
      threshold_percent: 5,
      created_at: '2026-01-01T00:00:00.000Z',
    };
  }

  async listRegressions() {
    return [];
  }

  async getJobStatuses() {
    return this.jobs.map(({ id, status, started_at, completed_at, failure_message }) => ({
      id,
      status,
      started_at,
      completed_at,
      failure_message,
    }));
  }

  async close() {}
}
