import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getSharedDb } from './src/server/db';
import { createApiApp } from './src/server/app';

async function startServer() {
  const db = getSharedDb();
  const app = createApiApp(db);
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listenWithRetry = (retriesLeft = 5) => {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
        setTimeout(() => {
          httpServer.close();
          listenWithRetry(retriesLeft - 1);
        }, 400);
        return;
      }
      console.error('Server listen error:', err);
    });

    const BIND_HOST = process.env.SGT_BIND_HOST || '127.0.0.1';
    httpServer.listen(PORT, BIND_HOST, () => {
      console.log(`SGT Integrated Business Server running on http://${BIND_HOST}:${PORT}`);
    });
  };

  listenWithRetry();

  const shutdown = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start SGT server:', err);
  process.exit(1);
});
