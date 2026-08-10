import { Link } from 'react-router-dom';
import { percent, shortId } from '../format';
import type { Comparison } from '../types';

export function RegressionList({ regressions }: { regressions: Comparison[] }) {
  return (
    <section className="panel regressions">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Threshold &gt; 5%</span>
          <h2>Regressions</h2>
        </div>
        <span className={`count ${regressions.length ? 'danger' : ''}`}>{regressions.length}</span>
      </div>
      {regressions.length === 0 ? (
        <div className="regression-clear">
          <span>✓</span>
          <div>
            <strong>No active regressions</strong>
            <small>Latest comparisons are within policy.</small>
          </div>
        </div>
      ) : (
        regressions.slice(0, 5).map((item) => (
          <Link className="regression-item" key={item.id} to={`/jobs/${item.current_job_id}`}>
            <div>
              <strong>{item.kernel_name}</strong>
              <small>#{shortId(item.current_job_id)}</small>
            </div>
            <span>{percent(item.latency_change_percent)} latency</span>
          </Link>
        ))
      )}
    </section>
  );
}
