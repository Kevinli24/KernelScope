import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { FakeRepository, kernel } from './helpers.js';

describe('job parameter validation', () => {
  const valid = {
    kernelId: kernel.id,
    inputSize: 1_048_576,
    blockSize: 256,
    warmupCount: 5,
    trialCount: 20,
    gitCommitHash: 'unknown',
  };

  it.each([
    ['too-small input', { inputSize: 100 }],
    ['unsupported block size', { blockSize: 300 }],
    ['negative warmups', { warmupCount: -1 }],
    ['zero trials', { trialCount: 0 }],
    ['shell-like commit', { gitCommitHash: 'main; rm -rf /' }],
    ['non-UUID kernel', { kernelId: '../binary' }],
  ])('rejects %s', async (_name, change) => {
    const response = await request(createApp(new FakeRepository()))
      .post('/api/jobs')
      .send({ ...valid, ...change });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request parameters');
  });

  it('rejects unknown body fields only by ignoring them safely', async () => {
    const response = await request(createApp(new FakeRepository()))
      .post('/api/jobs')
      .send({ ...valid, command: 'nvidia-smi' });
    expect(response.status).toBe(201);
    expect(response.body.data.command).toBeUndefined();
  });
});
