import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { compactNumber, metric, percent, shortId } from '../format';
import type { Comparison, Job } from '../types';

function isComparable(candidate: Job, current: Job): boolean {
  return (
    candidate.kernel_id === current.kernel_id &&
    candidate.status === 'completed' &&
    candidate.id !== current.id &&
    Number(candidate.input_size) === Number(current.input_size) &&
    candidate.block_size === current.block_size &&
    candidate.warmup_count === current.warmup_count &&
    candidate.trial_count === current.trial_count &&
    candidate.result?.gpu_name === current.result?.gpu_name &&
    candidate.result?.cuda_version === current.result?.cuda_version &&
    candidate.result?.driver_version === current.result?.driver_version
  );
}

export function JobDetail() {
  const { id = '' } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextJob, nextKernels, nextJobs] = await Promise.all([
        api.job(id),
        api.kernels(),
        api.jobs(),
      ]);
      setJob(nextJob);
      setJobs(nextJobs);
      setError('');
      const baselineId = nextKernels.find(
        (kernel) => kernel.id === nextJob.kernel_id,
      )?.baseline_job_id;
      const baseline = nextJobs.find((candidate) => candidate.id === baselineId);
      if (!comparison && baselineId && baseline && isComparable(baseline, nextJob))
        setComparison(await api.compare(baselineId, nextJob.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load job');
    }
  }, [comparison, id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [load]);
  if (error) return <div className="panel detail-message">{error}</div>;
  if (!job) return <div className="panel detail-message">Loading run…</div>;
  const result = job.result;
  const candidates = jobs.filter((candidate) => isComparable(candidate, job));
  const compareWith = async (baselineId: string) => {
    if (baselineId) setComparison(await api.compare(baselineId, job.id));
  };
  const markBaseline = async () => {
    await api.markBaseline(job.id);
    await load();
  };
  return (
    <div className="detail-page">
      <Link to="/" className="back-link">
        ← Back to control plane
      </Link>
      <div className="detail-title">
        <div>
          <span className="eyebrow">Run #{shortId(job.id)}</span>
          <h1>{job.kernel_name}</h1>
        </div>
        <StatusBadge status={job.status} />
      </div>
      {job.failure_message && <div className="error-banner">{job.failure_message}</div>}
      {result && (
        <>
          <section className="metric-grid">
            <div className="metric-card">
              <span>Correctness</span>
              <strong className={result.correct ? 'green' : 'red'}>
                {result.correct ? 'PASS' : 'FAIL'}
              </strong>
              <small>relative error {result.relative_error.toExponential(2)}</small>
            </div>
            <div className="metric-card">
              <span>Average latency</span>
              <strong>{metric(result.average_latency_ms)}</strong>
              <small>milliseconds / trial</small>
            </div>
            <div className="metric-card">
              <span>Effective bandwidth</span>
              <strong>{metric(result.effective_bandwidth_gbps, 2)}</strong>
              <small>GB/s</small>
            </div>
            <div className="metric-card">
              <span>Throughput</span>
              <strong>{compactNumber(result.throughput_elements_per_second)}</strong>
              <small>elements / second</small>
            </div>
          </section>
          <div className="detail-grid">
            <section className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Environment</span>
                  <h2>Hardware</h2>
                </div>
              </div>
              <dl>
                <dt>GPU</dt>
                <dd>{result.gpu_name}</dd>
                <dt>CUDA runtime</dt>
                <dd>{result.cuda_version}</dd>
                <dt>Compute capability</dt>
                <dd>{result.compute_capability ?? '—'}</dd>
                <dt>Driver</dt>
                <dd>{result.driver_version ?? '—'}</dd>
                <dt>Global memory</dt>
                <dd>
                  {result.total_memory_bytes
                    ? `${metric(Number(result.total_memory_bytes) / 2 ** 30, 1)} GiB`
                    : '—'}
                </dd>
              </dl>
            </section>
            <section className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Reproducibility</span>
                  <h2>Configuration</h2>
                </div>
              </div>
              <dl>
                <dt>Input size</dt>
                <dd>{Number(job.input_size).toLocaleString()}</dd>
                <dt>Block size</dt>
                <dd>{job.block_size}</dd>
                <dt>Warmups</dt>
                <dd>{job.warmup_count}</dd>
                <dt>Timed trials</dt>
                <dd>{job.trial_count}</dd>
                <dt>Git commit</dt>
                <dd className="mono">{job.git_commit_hash}</dd>
              </dl>
            </section>
          </div>
          <section className="panel compare-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Baseline analysis</span>
                <h2>Performance comparison</h2>
              </div>
              <button className="secondary-button" onClick={markBaseline}>
                Mark this run baseline
              </button>
            </div>
            <select defaultValue="" onChange={(event) => void compareWith(event.target.value)}>
              <option value="" disabled>
                Compare against a completed run…
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  #{shortId(candidate.id)} · {new Date(candidate.created_at).toLocaleString()}
                </option>
              ))}
            </select>
            {comparison && (
              <div
                className={`comparison ${comparison.is_regression ? 'comparison-danger' : 'comparison-good'}`}
              >
                <strong>
                  {comparison.is_regression ? 'Regression detected' : 'Within performance policy'}
                </strong>
                <span>Latency {percent(comparison.latency_change_percent)}</span>
                <span>Bandwidth {percent(comparison.bandwidth_change_percent)}</span>
                <span>Throughput {percent(comparison.throughput_change_percent)}</span>
              </div>
            )}
          </section>
        </>
      )}
      {!result && (
        <section className="panel waiting">
          <div className="spinner" />
          <h2>Benchmark {job.status}</h2>
          <p>This view refreshes automatically as the worker advances the job.</p>
        </section>
      )}
    </div>
  );
}
