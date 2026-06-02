import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './lib/config.js';
import { initPool, isMemoryMode } from './lib/storage.js';
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

  if (!opts.skipDb) {
    initPool(config);
    if (isMemoryMode) app.log.warn('SP_NO_DB=1 → using in-memory storage (DEV ONLY)');
  }
  if (!opts.skipMailer) initMailer(config.smtp);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
    index: 'index.html'
  });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'i18n'),
    prefix: '/i18n/',
    decorateReply: false
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  // Browser holt sich hier den Turnstile-Site-Key (oder null falls inaktiv)
  app.get('/api/public-config', async () => ({
    turnstileSiteKey: config.turnstileSiteKey || null,
    dailyMaxPerIp:    config.dailyMaxPerIp
  }));

  await app.register(rateLimit, { global: false });
  await app.register(secretRoutes);
  await app.register(pageRoutes);

  return app;
}
