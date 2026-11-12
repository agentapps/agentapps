import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Multi-page build: each screen is a separate HTML entry point.
// Output goes to ../static/ so the station can serve them via /apps/:appId/bundles/static/*
export default defineConfig({
  plugins: [react()],
  // Use relative paths so assets resolve correctly when served from
  // the station's /apps/:appId/bundles/static/ route
  base: './',
  build: {
    outDir: resolve(__dirname, '../static'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        tree: resolve(__dirname, 'tree.html'),
        detail: resolve(__dirname, 'detail.html'),
        form: resolve(__dirname, 'form.html'),
      },
      output: {
        // Use simple filenames for predictable bundle URLs
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    // Don't minify for easier debugging in the PoC
    minify: 'esbuild',
    sourcemap: false,
  },
  // Resolve React from the monorepo to avoid duplicate copies
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
