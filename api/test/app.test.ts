import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { FakeRepository, job, kernel } from './helpers.js';

describe('KernelScope API', () => {
  it('lists only registered kernels through the repository', async () => {
    const response = await request(createApp(new FakeRepository())).get('/api/kernels');
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ id: kernel.id, slug: 'reduction-naive' });
  });

  it('creates a validated benchmark job', async () => {
    const response = await request(createApp(new FakeRepository())).post('/api/jobs').send({
      kernelId: kernel.id,
      inputSize: 1_048_576,
      blockSize: 256,
      warmupCount: 5,
      trialCount: 20,
      gitCommitHash: 'abcdef1',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('queued');
  });

  it('returns 404 for an unknown job', async () => {
    const response = await request(createApp(new FakeRepository())).get(
      '/api/jobs/99999999-9999-4999-8999-999999999999',
    );
    expect(response.status).toBe(404);
  });

  it('refuses to baseline an incomplete job', async () => {
    const response = await request(createApp(new FakeRepository())).post(
      `/api/jobs/${job.id}/baseline`,
    );
    expect(response.status).toBe(409);
  });
});
