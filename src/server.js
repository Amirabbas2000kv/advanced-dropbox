const http = require('http');
const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const prisma = require('./config/db');
const { initSocket } = require('./realtime/socket');

// Socket.IO needs the raw HTTP server, so we create it ourselves
const server = http.createServer(app);
initSocket(server);

server.listen(config.port, () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
});

// Graceful shutdown: stop accepting requests, close the DB, then exit
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force exit if something hangs for more than 10 seconds
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Last safety nets: log the error so it is never lost
process.on('unhandledRejection', (reason) => {
  logger.error(reason instanceof Error ? reason.stack : `Unhandled rejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(err.stack || err.message);
  process.exit(1);
});