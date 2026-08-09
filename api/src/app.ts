import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import type { Repository } from './repository.js';
import { compareSchema, createJobSchema, jobListSchema } from './validation.js';

const asyncRoute =
  (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };

export function createApp(repository: Repository) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  app.get(
    '/api/kernels',
    asyncRoute(async (_request, response) => {
      response.json({ data: await repository.listKernels() });
    }),
  );

  app.post(
    '/api/jobs',
    asyncRoute(async (request, response) => {
      const input = createJobSchema.parse(request.body);
      const job = await repository.createJob(input);
      response.status(201).json({ data: job });
    }),
  );

  app.get(
    '/api/jobs',
    asyncRoute(async (request, response) => {
      const query = jobListSchema.parse(request.query);
      response.json({ data: await repository.listJobs(query.limit, query.status) });
    }),
  );

  app.get(
    '/api/jobs/:id',
    asyncRoute(async (request, response) => {
      const id = String(request.params.id);
      const job = await repository.getJob(id);
      if (!job) {
        response.status(404).json({ error: 'Benchmark job not found' });
        return;
      }
      response.json({ data: job });
    }),
  );

  app.post(
    '/api/jobs/:id/baseline',
    asyncRoute(async (request, response) => {
      const kernel = await repository.markBaseline(String(request.params.id));
      if (!kernel) {
        response.status(409).json({ error: 'Only a completed benchmark can be a baseline' });
        return;
      }
      response.json({ data: kernel });
    }),
  );

  app.post(
    '/api/comparisons',
    asyncRoute(async (request, response) => {
      const input = compareSchema.parse(request.body);
      response.status(201).json({
        data: await repository.compareJobs(input.baselineJobId, input.currentJobId),
      });
    }),
  );

  app.get(
    '/api/regressions',
    asyncRoute(async (request, response) => {
      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
      response.json({ data: await repository.listRegressions(limit) });
    }),
  );

  app.get('/api/events', (request, response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    let since = new Date(Date.now() - 60_000);
    let active = true;

    const publish = async () => {
      try {
        const pollStartedAt = new Date();
        const statuses = await repository.getJobStatuses(since);
        since = pollStartedAt;
        if (statuses.length > 0) {
          response.write(`event: jobs\ndata: ${JSON.stringify(statuses)}\n\n`);
        } else {
          response.write(': keepalive\n\n');
        }
      } catch {
        response.write(
          `event: error\ndata: ${JSON.stringify({ message: 'status poll failed' })}\n\n`,
        );
      }
    };

    void publish();
    const interval = setInterval(() => void publish(), 1000);
    request.on('close', () => {
      if (!active) return;
      active = false;
      clearInterval(interval);
      response.end();
    });
  });

  app.use((_request, response) => response.status(404).json({ error: 'Route not found' }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    if (error instanceof ZodError) {
      response.status(400).json({
        error: 'Invalid request parameters',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    if (error instanceof Error && error.message === 'KERNEL_NOT_FOUND') {
      response.status(404).json({ error: 'Registered kernel not found or disabled' });
      return;
    }
    if (error instanceof Error && error.message === 'RESULT_NOT_FOUND') {
      response.status(409).json({ error: 'Both jobs must be completed and have results' });
      return;
    }
    if (error instanceof Error && error.message === 'KERNEL_MISMATCH') {
      response.status(409).json({ error: 'Only runs of the same kernel can be compared' });
      return;
    }
    if (error instanceof Error && error.message === 'CONFIGURATION_MISMATCH') {
      response
        .status(409)
        .json({ error: 'Compared runs must use the same benchmark configuration' });
      return;
    }
    if (error instanceof Error && error.message === 'HARDWARE_MISMATCH') {
      response.status(409).json({ error: 'Compared runs must use the same hardware fingerprint' });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
