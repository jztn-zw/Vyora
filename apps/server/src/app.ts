import { createServer } from 'node:http';

// Website API only. Desktop capture, its SQLite library and guest-device pairing
// remain owned by the Electron app.
export function createApiServer() {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const pathname = request.url?.split('?')[0];

    if (pathname === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end(
          JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or HEAD.' } }),
        );
        return;
      }
      response.writeHead(200);
      response.end(
        request.method === 'HEAD'
          ? undefined
          : JSON.stringify({ status: 'ok', service: 'vyora-api' }),
      );
      return;
    }

    response.writeHead(404);
    response.end(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'This API route is not available.' } }),
    );
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
