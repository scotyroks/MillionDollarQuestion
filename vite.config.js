import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

// The contestant display is a React app. It is served by the Node server at
// /display, with its hashed assets living under /display-app/. During a game
// it talks to the same server it was loaded from (SSE at /events), so no dev
// proxy config is needed for production — only `vite dev` needs the proxy.
export default defineConfig({
  root: path.join(dir, 'client'),
  base: '/display-app/',
  plugins: [react()],
  build: {
    outDir: path.join(dir, 'public/display-app'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/events': { target: 'http://localhost:3000', ws: false },
      '/action': 'http://localhost:3000',
      '/poll': 'http://localhost:3000',
    },
  },
});
