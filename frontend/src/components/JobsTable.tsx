import { Link } from 'react-router-dom';
import { compactNumber, metric, shortId } from '../format';
import type { Job } from '../types';
import { StatusBadge } from './StatusBadge';

export function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <section className="panel jobs-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Queue telemetry</span>
          <h2>Recent jobs</h2>
        </div>
        <span className="live-chip">
          <i /> live
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Kernel</th>
              <th>Input</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Bandwidth</th>
              <th>Correct</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link className="run-link" to={`/jobs/${job.id}`}>
                    #{shortId(job.id)}
                  </Link>
                  <small>{new Date(job.created_at).toLocaleTimeString()}</small>
                </td>
                <td>{job.kernel_name}</td>
                <td className="mono">{compactNumber(job.input_size)}</td>
                <td>
                  <StatusBadge status={job.status} />
                </td>
                <td className="mono">
                  {job.result ? `${metric(job.result.average_latency_ms)} ms` : '—'}
                </td>
                <td className="mono">
                  {job.result ? `${metric(job.result.effective_bandwidth_gbps, 2)} GB/s` : '—'}
                </td>
                <td>
                  {job.result ? (
                    <span className={job.result.correct ? 'pass' : 'fail'}>
                      {job.result.correct ? 'PASS' : 'FAIL'}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No benchmark jobs yet. Dispatch one to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
