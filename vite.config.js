import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

// The T&T SDK's Studio publishes a map into src/content/maps/<id>.json, where
// it ships with the game in place of its district file (PUT), or takes it out
// again (DELETE). Dev server only: a built game has no such endpoint.
function sdkPublish() {
  const dir = path.resolve('src/content/maps');
  return {
    name: 'tt-sdk-publish',
    configureServer(server) {
      server.middlewares.use('/__sdk/maps', (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const id = decodeURIComponent((req.url || '').split('?')[0].replace(/^\//, ''));
        if (!/^[a-z0-9-]+$/i.test(id)) return send(400, { error: 'bad map id' });
        const file = path.join(dir, `${id}.json`);
        if (req.method === 'DELETE') {
          fs.rmSync(file, { force: true });
          return send(200, { ok: true });
        }
        if (req.method !== 'PUT') return send(405, { error: 'PUT or DELETE' });
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const doc = JSON.parse(body);
            if (doc.format !== 'tt-map' || doc.id !== id || !doc.district?.city) throw new Error(`not a map of ${id}`);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(file, `${JSON.stringify(doc, null, 1)}\n`);
            send(200, { ok: true, file: path.relative(process.cwd(), file) });
          } catch (err) {
            send(400, { error: err.message });
          }
        });
      });
    },
  };
}

// `npm run build` produces dist/index.html: one self-contained file with three.js
// and all game code inlined, playable offline.
export default defineConfig({
  plugins: [viteSingleFile(), sdkPublish()],
  build: { target: 'es2022' },
  server: { host: true }, // reachable from a phone on the same network
});
