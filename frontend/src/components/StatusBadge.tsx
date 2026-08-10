import type { JobStatus } from '../types';

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`status status-${status}`}>
      <i />
      {status}
    </span>
  );
}
