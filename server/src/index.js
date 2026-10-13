import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

await connectDB();
createApp().listen(env.port, async () => {
  logger.info(`SecureVault API listening on http://localhost:${env.port}`);
  if (process.env.SEED_DEMO === '1') {
    const { seedDemo } = await import('./seed/demo.js');
    await seedDemo(`http://127.0.0.1:${env.port}`, (m) => logger.info(m)).catch((e) => logger.error(e, 'seed failed'));
  }
});
