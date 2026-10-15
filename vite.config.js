import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const versionFile = () => ({ name: 'version-file', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); } });
export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [preact(), viteSingleFile(), versionFile()],
  esbuild: { legalComments: 'none' },
  build: { target: 'es2019', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});
