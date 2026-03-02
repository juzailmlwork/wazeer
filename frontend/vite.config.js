import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    allowedHosts: ['fwr.limecodelabs.com'],
    proxy: {
      '/api': 'http://localhost:7200',
    },
  },
});