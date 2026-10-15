import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  esbuild: { legalComments: 'none' },
  build: { target: 'es2019', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});
