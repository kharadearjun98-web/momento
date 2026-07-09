import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  const isProductionBuild = command === 'build';

  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
    esbuild: isProductionBuild
      ? {
          drop: ['console', 'debugger'],
        }
      : undefined,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
  };
});
