import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` keeps every asset path relative, so the built `dist/` folder
// works from any static host or sub-path (and from a zip extracted anywhere).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Vendor code (React + Recharts) in its own chunk so it caches across releases.
        manualChunks: { vendor: ['react', 'react-dom', 'recharts'] },
      },
    },
    // The vendor chunk is ~155 kB gzipped, mostly Recharts; fine for a single-page dashboard.
    chunkSizeWarningLimit: 650,
  },
});
