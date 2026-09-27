import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces dist/index.html: one self-contained file with three.js
// and all game code inlined, playable offline.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2022' },
  server: { host: true }, // reachable from a phone on the same network
});
