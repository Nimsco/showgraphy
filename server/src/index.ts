import { app } from './app.js';
import { createServer } from 'node:http';
import { connectDatabase } from './config/database.js';
import { assertRuntimeConfig, env } from './config/env.js';
import { createChatSocketServer } from './realtime/chat.socket.js';
import mongoose from 'mongoose';

async function start() {
  assertRuntimeConfig();
  await connectDatabase();
  const server = createServer(app);
  const chat = createChatSocketServer(server);
  server.listen(env.PORT, '0.0.0.0', () => console.info(`Showgraphy API and chat listening on port ${env.PORT}`));

  const shutdown = (signal: string) => {
    console.info(`Showgraphy is shutting down (${signal}).`);
    chat.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
