import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const JobDetail = lazy(() =>
  import('./pages/JobDetail').then((module) => ({ default: module.JobDetail })),
);

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-mark">K</span>
          <div>
            <strong>KernelScope</strong>
            <small>GPU performance control plane</small>
          </div>
        </Link>
        <div className="header-meta">
          <span>
            <i className="online" /> system telemetry
          </span>
          <span>mock + GPU ready</span>
        </div>
      </header>
      <main>
        <Suspense fallback={<div className="panel detail-message">Loading KernelScope…</div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
          </Routes>
        </Suspense>
      </main>
      <footer>
        KernelScope <span>·</span> deterministic benchmarking infrastructure <span>·</span>{' '}
        regression policy 5%
      </footer>
    </div>
  );
}
