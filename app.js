import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './lib/config.js';
import { initPool } from './lib/db.js';
import { initMailer } from './lib/mailer.js';
import secretRoutes from './routes/secret.js';
import pageRoutes from './routes/pages.js';

export async function buildApp(opts = {}) {
  const config = loadConfig();
  const app = Fastify({
    logger: { level: opts.logLevel || 'info' },
    bodyLimit: config.maxBodyBytes,
    trustProxy: true
  });

  app.decorate('config', config);

  if (!opts.skipDb) initPool(config);
  if (!opts.skipMailer) initMailer(config.smtp);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
    index: 'index.html'
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  await app.register(rateLimit, { global: false });
  await app.register(secretRoutes);
  await app.register(pageRoutes);

  return app;
}
