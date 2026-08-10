import { useCallback, useEffect, useState } from 'react';
import { API_URL, api } from '../api';
import { JobsTable } from '../components/JobsTable';
import { PerformanceChart } from '../components/PerformanceChart';
import { RegressionList } from '../components/RegressionList';
import { SubmissionForm } from '../components/SubmissionForm';
import { compactNumber, metric } from '../format';
import type { Comparison, Job, JobInput, Kernel } from '../types';

export function Dashboard() {
  const [kernels, setKernels] = useState<Kernel[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [regressions, setRegressions] = useState<Comparison[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextKernels, nextJobs, nextRegressions] = await Promise.all([
        api.kernels(),
        api.jobs(),
        api.regressions(),
      ]);
      setKernels(nextKernels);
      setJobs(nextJobs);
      setRegressions(nextRegressions);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reach API');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const events = new EventSource(`${API_URL}/api/events`);
    events.addEventListener('jobs', () => void refresh());
    return () => events.close();
  }, [refresh]);

  const submit = async (input: JobInput) => {
    setSubmitting(true);
    try {
      await api.createJob(input);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const completed = jobs.filter((job) => job.result);
  const latest = completed[0]?.result;
  const running = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  return (
    <>
      {error && <div className="error-banner">API error: {error}</div>}
      <section className="stats-grid">
        <div className="stat">
          <span>Queue depth</span>
          <strong>{running}</strong>
          <small>active jobs</small>
        </div>
        <div className="stat">
          <span>Last latency</span>
          <strong>{latest ? metric(latest.average_latency_ms) : '—'}</strong>
          <small>milliseconds</small>
        </div>
        <div className="stat">
          <span>Last bandwidth</span>
          <strong>{latest ? metric(latest.effective_bandwidth_gbps, 2) : '—'}</strong>
          <small>GB/s effective</small>
        </div>
        <div className="stat">
          <span>Throughput</span>
          <strong>{latest ? compactNumber(latest.throughput_elements_per_second) : '—'}</strong>
          <small>elements / second</small>
        </div>
      </section>
      <div className="top-grid">
        <SubmissionForm kernels={kernels} submitting={submitting} onSubmit={submit} />
        <RegressionList regressions={regressions} />
      </div>
      <PerformanceChart jobs={jobs} />
      <JobsTable jobs={jobs} />
    </>
  );
}
