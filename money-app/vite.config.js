import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';

// The Money app reuses the Workspace's UI kit, dates, i18n and styles from ../src,
// but its data lives in the artifact's own database (src/lib/store.js), not the Workspace's.
const here = dirname(new URL(import.meta.url).pathname);
const wsSrc = resolve(here, '../src');
const appSrc = resolve(here, 'src');
const swap = { [resolve(wsSrc, 'lib/db.js')]: resolve(appSrc, 'lib/store.js'), [resolve(wsSrc, 'lib/model.js')]: resolve(appSrc, 'lib/model-lite.js') };
const shared = () => ({
  name: 'money-shared', enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return null;
    let p = resolve(dirname(importer), source);
    // money-app/src/ui/x or lib/x that doesn't exist here -> the Workspace's copy
    if (p.startsWith(appSrc) && !existsSync(p)) { const alt = resolve(wsSrc, p.slice(appSrc.length + 1)); if (existsSync(alt)) p = alt; }
    return swap[p] || (existsSync(p) ? p : null);
  },
});
export default defineConfig({
  root: here,
  plugins: [shared(), preact(), viteSingleFile()],
  esbuild: { legalComments: 'none' },
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true, target: 'es2019', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});
