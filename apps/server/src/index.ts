import { createApiServer } from './app.ts';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = createApiServer();
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the other server or choose another PORT.`
      : `Could not start VYORA API: ${error.message}`,
  );
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`VYORA API listening at http://${host}:${port}/api/health`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
