import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: {alias: [{find: /^(?:.*\/)?repository\.ts$/, replacement: new URL('./professional-repository.ts', import.meta.url).pathname}]},
  build: {outDir: '.superpowers/probes/task7a-fixture-dist', rollupOptions: {input: new URL('./professional-app.html', import.meta.url).pathname}},
  server: {host: '127.0.0.1', port: 4197, strictPort: true},
});
