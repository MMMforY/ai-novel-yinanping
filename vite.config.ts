import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: Number(loadEnv(mode, process.cwd(), '').WEB_PORT || 5173),
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:' + (loadEnv(mode, process.cwd(), '').API_PORT || '8787') },
    fs: { deny: ['.env', '.env.*', '**/.git/**'] },
  },
}));
