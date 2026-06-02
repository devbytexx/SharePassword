import Fastify from 'fastify';
import { loadConfig } from './lib/config.js';
import { initPool } from './lib/db.js';
import { initMailer } from './lib/mailer.js';

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

  return app;
}
