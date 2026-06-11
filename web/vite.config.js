import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend ở 5174 (5173 hay bị CiteFlow chiếm); proxy /api -> backend 4799
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:4799' },
  },
});
