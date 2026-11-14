import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { assertRuntimeConfig, env } from './config/env.js';

async function start() {
  assertRuntimeConfig();
  await connectDatabase();
  app.listen(env.PORT, () => console.info(`Showgraphy API listening on http://localhost:${env.PORT}`));
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
