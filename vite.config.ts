/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import zipPack from 'vite-plugin-zip-pack'
import manifest from './manifest.config'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    crx({ manifest }),
    zipPack({
      inDir: 'dist',
      outDir: '.',
      outFileName: `${pkg.name}-v${pkg.version}.zip`,
    }),
  ],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
