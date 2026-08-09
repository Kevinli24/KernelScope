import { z } from 'zod';

export const createJobSchema = z.object({
  kernelId: z.uuid('kernelId must be a UUID'),
  inputSize: z.number().int().min(1024).max(1_073_741_824),
  blockSize: z.union([
    z.literal(32),
    z.literal(64),
    z.literal(128),
    z.literal(256),
    z.literal(512),
    z.literal(1024),
  ]),
  warmupCount: z.number().int().min(0).max(100),
  trialCount: z.number().int().min(1).max(1000),
  gitCommitHash: z
    .string()
    .min(1)
    .max(64)
    .regex(/^(unknown|[0-9a-f]{7,64})$/i, 'must be "unknown" or a Git SHA'),
});

export const compareSchema = z
  .object({
    baselineJobId: z.uuid(),
    currentJobId: z.uuid(),
  })
  .refine((value) => value.baselineJobId !== value.currentJobId, {
    message: 'baseline and current jobs must be different',
  });

export const jobListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['queued', 'running', 'completed', 'failed']).optional(),
});
