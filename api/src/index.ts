import { createApp } from './app.js';
import { PgRepository } from './pg-repository.js';

const port = Number(process.env.API_PORT ?? 3001);
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://kernelscope:kernelscope@localhost:5432/kernelscope';
const repository = new PgRepository(databaseUrl);
const app = createApp(repository);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`KernelScope API listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    void repository.close().finally(() => process.exit(0));
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
