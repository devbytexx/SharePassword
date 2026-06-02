import { buildApp } from './app.js';

const app = await buildApp();

try {
  await app.listen({ port: app.config.port, host: app.config.bind });
  app.log.info(`SharePassword listening on ${app.config.bind}:${app.config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    app.log.info(`received ${sig}, shutting down`);
    await app.close();
    process.exit(0);
  });
}
