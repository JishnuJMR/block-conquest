import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// An independent root: the prototype never imports the game or its environment.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  server: {
    host: '127.0.0.1', port: 5180, strictPort: true,
    watch: { ignored: ['**/screenshots/**', '**/verify.mjs', '**/*.md'] },
  },
  preview: { host: '127.0.0.1', port: 4180, strictPort: true },
  build: {
    outDir: 'dist', emptyOutDir: true,
    rolldownOptions: {
      input: Object.fromEntries(['index', 'identity', 'review'].map(name => [name, fileURLToPath(new URL(`${name}.html`, import.meta.url))])),
    },
  },
});
