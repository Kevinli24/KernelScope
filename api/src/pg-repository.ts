import pg from 'pg';
import { calculateComparison, type Repository } from './repository.js';
import type { BenchmarkResult, Comparison, CreateJobInput, Job, Kernel } from './types.js';

const { Pool } = pg;

const jobSelect = `
  SELECT j.*, k.slug AS kernel_slug, k.name AS kernel_name,
    CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'correct', r.correct,
      'actual_result', r.actual_result,
      'expected_result', r.expected_result,
      'relative_error', r.relative_error,
      'average_latency_ms', r.average_latency_ms,
      'effective_bandwidth_gbps', r.effective_bandwidth_gbps,
      'throughput_elements_per_second', r.throughput_elements_per_second,
      'raw_output', r.raw_output,
      'gpu_name', h.gpu_name,
      'cuda_version', h.cuda_version,
      'compute_capability', h.compute_capability,
      'driver_version', h.driver_version,
      'total_memory_bytes', h.total_memory_bytes
    ) END AS result
  FROM benchmark_jobs j
  JOIN kernels k ON k.id = j.kernel_id
  LEFT JOIN benchmark_results r ON r.job_id = j.id
  LEFT JOIN hardware_information h ON h.id = r.hardware_id`;

export class PgRepository implements Repository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }

  async listKernels(): Promise<Kernel[]> {
    const result = await this.pool.query<Kernel>(
      'SELECT id, slug, name, description, enabled, baseline_job_id FROM kernels WHERE enabled ORDER BY name',
    );
    return result.rows;
  }

  async createJob(input: CreateJobInput): Promise<Job> {
    const result = await this.pool.query<Job>(
      `INSERT INTO benchmark_jobs
        (kernel_id, input_size, block_size, warmup_count, trial_count, git_commit_hash)
       SELECT id, $2, $3, $4, $5, $6 FROM kernels WHERE id = $1 AND enabled
       RETURNING *,
         (SELECT slug FROM kernels WHERE id = kernel_id) AS kernel_slug,
         (SELECT name FROM kernels WHERE id = kernel_id) AS kernel_name`,
      [
        input.kernelId,
        input.inputSize,
        input.blockSize,
        input.warmupCount,
        input.trialCount,
        input.gitCommitHash,
      ],
    );
    if (!result.rows[0]) throw new Error('KERNEL_NOT_FOUND');
    return result.rows[0];
  }

  async listJobs(limit: number, status?: string): Promise<Job[]> {
    const values: unknown[] = [limit];
    const where = status ? 'WHERE j.status = $2' : '';
    if (status) values.push(status);
    const result = await this.pool.query<Job>(
      `${jobSelect} ${where} ORDER BY j.created_at DESC LIMIT $1`,
      values,
    );
    return result.rows;
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.pool.query<Job>(`${jobSelect} WHERE j.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async markBaseline(jobId: string): Promise<Kernel | null> {
    const result = await this.pool.query<Kernel>(
      `UPDATE kernels k SET baseline_job_id = j.id
       FROM benchmark_jobs j
       WHERE j.id = $1 AND j.kernel_id = k.id AND j.status = 'completed'
       RETURNING k.id, k.slug, k.name, k.description, k.enabled, k.baseline_job_id`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  async compareJobs(baselineJobId: string, currentJobId: string): Promise<Comparison> {
    const rows = await this.pool.query<{
      id: string;
      kernel_id: string;
      status: string;
      input_size: string;
      block_size: number;
      warmup_count: number;
      trial_count: number;
      hardware_id: string;
      result: BenchmarkResult;
    }>(
      `SELECT j.id, j.kernel_id, j.status, j.input_size, j.block_size, j.warmup_count,
              j.trial_count, r.hardware_id, to_jsonb(r.*) AS result
       FROM benchmark_jobs j JOIN benchmark_results r ON r.job_id = j.id
       WHERE j.id = ANY($1::uuid[])`,
      [[baselineJobId, currentJobId]],
    );
    const baseline = rows.rows.find((row) => row.id === baselineJobId);
    const current = rows.rows.find((row) => row.id === currentJobId);
    if (!baseline || !current) throw new Error('RESULT_NOT_FOUND');
    if (baseline.kernel_id !== current.kernel_id) throw new Error('KERNEL_MISMATCH');
    if (
      baseline.input_size !== current.input_size ||
      baseline.block_size !== current.block_size ||
      baseline.warmup_count !== current.warmup_count ||
      baseline.trial_count !== current.trial_count
    ) {
      throw new Error('CONFIGURATION_MISMATCH');
    }
    if (baseline.hardware_id !== current.hardware_id) throw new Error('HARDWARE_MISMATCH');
    const comparison = calculateComparison(
      baselineJobId,
      currentJobId,
      baseline.result,
      current.result,
    );
    const result = await this.pool.query<Comparison>(
      `INSERT INTO performance_comparisons
        (baseline_job_id, current_job_id, latency_change_percent, bandwidth_change_percent,
         throughput_change_percent, is_regression, threshold_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (baseline_job_id, current_job_id) DO UPDATE SET
         latency_change_percent = EXCLUDED.latency_change_percent,
         bandwidth_change_percent = EXCLUDED.bandwidth_change_percent,
         throughput_change_percent = EXCLUDED.throughput_change_percent,
         is_regression = EXCLUDED.is_regression,
         threshold_percent = EXCLUDED.threshold_percent,
         created_at = NOW()
       RETURNING *`,
      [
        comparison.baseline_job_id,
        comparison.current_job_id,
        comparison.latency_change_percent,
        comparison.bandwidth_change_percent,
        comparison.throughput_change_percent,
        comparison.is_regression,
        comparison.threshold_percent,
      ],
    );
    return result.rows[0]!;
  }

  async listRegressions(limit: number): Promise<Comparison[]> {
    const result = await this.pool.query<Comparison>(
      `SELECT c.*, k.name AS kernel_name
       FROM performance_comparisons c
       JOIN benchmark_jobs j ON j.id = c.current_job_id
       JOIN kernels k ON k.id = j.kernel_id
       WHERE c.is_regression
       ORDER BY c.created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async getJobStatuses(since: Date) {
    const result = await this.pool.query<
      Pick<Job, 'id' | 'status' | 'started_at' | 'completed_at' | 'failure_message'>
    >(
      `SELECT id, status, started_at, completed_at, failure_message
       FROM benchmark_jobs WHERE created_at >= $1 OR started_at >= $1 OR completed_at >= $1`,
      [since],
    );
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
