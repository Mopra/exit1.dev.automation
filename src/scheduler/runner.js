// Standalone entrypoint for the content scheduler.
//
// Use this to run the scheduler as its own process (PM2 app / second container /
// local `npm run scheduler`). In the default single-container VPS deploy the
// scheduler is started in-process by the webhook receiver instead (see
// server.js), so do NOT run both at once or every post fires twice.

import { config } from '../config.js';
import { startScheduler } from './scheduler.js';

if (!config.scheduler.enabled) {
  console.warn('[scheduler] CONTENT_SCHEDULER_ENABLED is false — nothing to do, exiting.');
  process.exit(0);
}

const stop = startScheduler();

const shutdown = (signal) => {
  console.log(`\n[${signal}] stopping content scheduler`);
  stop();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Keep the process alive (the scheduler's own interval is unref'd on purpose).
setInterval(() => {}, 1 << 30);
