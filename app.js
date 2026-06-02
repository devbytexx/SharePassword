import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from './lib/config.js';
import { initPool } from './lib/db.js';
import { initMailer } from './lib/mailer.js';
import secretRoutes from './routes/secret.js';

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

  app.get('/api/health', async () => ({ status: 'ok' }));

  await app.register(rateLimit, { global: false });
  await app.register(secretRoutes);

  return app;
}
