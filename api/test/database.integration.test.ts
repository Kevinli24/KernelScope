import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PgRepository } from '../src/pg-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('PostgreSQL repository integration', () => {
  const repository = new PgRepository(databaseUrl!);

  afterAll(async () => repository.close());

  it('inserts and reads a queued job for a registered kernel', async () => {
    const [kernel] = await repository.listKernels();
    expect(kernel).toBeDefined();
    const created = await repository.createJob({
      kernelId: kernel!.id,
      inputSize: 65_536,
      blockSize: 256,
      warmupCount: 1,
      trialCount: 2,
      gitCommitHash: randomUUID().replaceAll('-', '').slice(0, 12),
    });
    const loaded = await repository.getJob(created.id);
    expect(loaded).toMatchObject({ id: created.id, status: 'queued' });
  });
});
