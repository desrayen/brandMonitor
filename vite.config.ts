import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NEXT_PUBLIC_* vars are set by the Supabase ↔ Vercel integration (public values only)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: {
    rollupOptions: {
      output: {
        // keep ECharts in its own cacheable chunk
        manualChunks: id => (id.includes('node_modules/echarts') || id.includes('node_modules/zrender') ? 'echarts' : undefined),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
