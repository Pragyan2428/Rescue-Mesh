import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the production build can be hosted from any sub-path
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { three: ['three'], gsap: ['gsap'] } } },
  },
});
