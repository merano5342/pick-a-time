import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'path';
import {defineConfig} from 'vite';

// `npm run dev` runs the SPA and the Worker (worker/index.ts, with a local D1)
// together on one origin, the same way production serves them.
export default defineConfig(() => {
  return {
    base: '/',
    plugins: [react(), tailwindcss(), cloudflare()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
