import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@openclaw': path.resolve(here, '../../src'),
      '@ui-shared': path.resolve(here, '../../ui/src/ui'),
    },
  },
  build: {
    outDir: path.resolve(here, '../../dist/web-ui'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:18789',
        ws: true,
      },
    },
  },
})
