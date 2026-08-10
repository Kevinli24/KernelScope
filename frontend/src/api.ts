import type { Comparison, Job, JobInput, Kernel } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) {
    const details = body.details
      ?.map((item: { path: string; message: string }) => `${item.path}: ${item.message}`)
      .join(', ');
    throw new Error(details || body.error || `Request failed (${response.status})`);
  }
  return body.data;
}

export const api = {
  kernels: () => request<Kernel[]>('/api/kernels'),
  jobs: () => request<Job[]>('/api/jobs?limit=100'),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  regressions: () => request<Comparison[]>('/api/regressions'),
  createJob: (input: JobInput) =>
    request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify(input) }),
  markBaseline: (id: string) => request<Kernel>(`/api/jobs/${id}/baseline`, { method: 'POST' }),
  compare: (baselineJobId: string, currentJobId: string) =>
    request<Comparison>('/api/comparisons', {
      method: 'POST',
      body: JSON.stringify({ baselineJobId, currentJobId }),
    }),
};
