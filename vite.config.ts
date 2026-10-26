import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        report: resolve(import.meta.dirname, 'report.html'),
        settings: resolve(import.meta.dirname, 'settings.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: { entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    },
  },
  test: { environment: 'node' },
});
