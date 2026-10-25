import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  esbuild: { legalComments: 'none' },
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
})
